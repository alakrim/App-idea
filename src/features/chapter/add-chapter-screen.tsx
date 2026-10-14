import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useSeries } from '@/db/hooks';
import { usePipeline, type CostEstimate, type SourcePreview } from '@/features/pipeline/facade';
import { PDF_MAX_BYTES, pdfTooLargeMessage } from '@/core/pipeline/limits';
import { ConfirmSheet } from '@/features/shared/confirm-sheet';
import { isEstimateUnknown } from '@/features/shared/estimate-price';
import { formatFileSize } from '@/features/shared/format';
import { goBackOrHome } from '@/features/shared/navigation';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ClipboardPaste, FileText, TriangleAlert } from '@/ui/icons';
import { SegmentedControl, type SegmentedOption } from '@/ui/segmented-control';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/theme';
import {
  gutter,
  hairline,
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  radius,
  space,
  typography,
} from '@/ui/tokens';

import { createBlockedCopy } from './create-gate-copy';
import { EstimateCard, type EstimateStatus } from './estimate-card';
import { SourcePreviewCard } from './source-preview-card';
import { isWebUrl } from './source-state';
import {
  canCreateChapter,
  estimateChars,
  titleFromFileName,
  titleFromText,
  urlProblem,
  type SourceMode,
} from './source-state';

const DEBOUNCE_MS = 600;
type EstimateOutcome = { kind: 'ready'; estimate: CostEstimate } | { kind: 'error' };

/** The cost estimate runs once typing pauses, so it is not recomputed on every keystroke. */
const ESTIMATE_DEBOUNCE_MS = 300;
const MODE_OPTIONS: readonly SegmentedOption<SourceMode>[] = [
  { value: 'link', label: 'Link' },
  { value: 'pdf', label: 'PDF' },
  { value: 'text', label: 'Text' },
];

type LinkState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string; preview: SourcePreview }
  | { kind: 'error'; message: string };

interface PickedFile {
  uri: string;
  name: string;
  size: number;
}

export interface AddChapterScreenProps {
  seriesId: string;
}

/** Reads the series languages, which price the chapter, and hands them to the form. */
export function AddChapterScreen({ seriesId }: AddChapterScreenProps) {
  const series = useSeries(seriesId);
  return (
    <AddChapterForm
      seriesId={seriesId}
      sourceLang={series?.sourceLang ?? null}
      targetLang={series?.targetLang ?? null}
    />
  );
}

export interface AddChapterFormProps {
  seriesId: string;
  sourceLang: string | null;
  targetLang: string | null;
}

/** Add a chapter from a link, a PDF or pasted text. Shows the cost before the chapter is created. */
export function AddChapterForm({ seriesId, sourceLang, targetLang }: AddChapterFormProps) {
  const { colors } = useTheme();
  const pipeline = usePipeline();
  const [mode, setMode] = useState<SourceMode>('link');
  const [url, setUrl] = useState('');
  const [link, setLink] = useState<LinkState>({ kind: 'idle' });
  const [retryToken, setRetryToken] = useState(0);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [estimateOutcome, setEstimateOutcome] = useState<EstimateOutcome | null>(null);
  const [estimateRetry, setEstimateRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [confirmingUnpriced, setConfirmingUnpriced] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);

  // Load the preview once the link has been still for a moment, and cancel any load it replaces.
  useEffect(() => {
    if (mode !== 'link') return;
    const trimmed = url.trim();
    if (!isWebUrl(trimmed)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLink({ kind: 'loading' });
      pipeline
        .previewUrl(trimmed, controller.signal)
        .then((preview) => {
          setLink({ kind: 'ready', url: trimmed, preview });
          if (!titleEdited && preview.title) setTitle(preview.title);
        })
        .catch((error: unknown) => {
          if (isAbort(error)) return;
          setLink({
            kind: 'error',
            message: "We couldn't load this link. Check your connection and try again.",
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `titleEdited` is read on resolve only; a preview should not reload when the user edits the title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline, mode, url, retryToken]);

  // Offer the clipboard's link when the field is empty. Clipboard access is best-effort.
  useEffect(() => {
    if (mode !== 'link' || url !== '') return;
    let active = true;
    void Clipboard.hasStringAsync()
      .then(async (has) => (has ? Clipboard.getStringAsync() : ''))
      .then((clip) => {
        if (active) setClipboardUrl(isWebUrl(clip) ? clip.trim() : null);
      })
      .catch(() => {
        if (active) setClipboardUrl(null);
      });
    return () => {
      active = false;
    };
  }, [mode, url]);

  // The estimate follows the source: the preview's word count, the file size, or the pasted text.
  // A link that is not a valid address has no preview, even if an earlier one is still in state.
  const linkNow = mode === 'link' && isWebUrl(url) ? link : ({ kind: 'idle' } as const);
  const readyPreview = linkNow.kind === 'ready' ? linkNow.preview : null;
  const chars = useMemo(
    () => sourceChars(mode, readyPreview, file, text),
    [mode, readyPreview, file, text],
  );
  useEffect(() => {
    if (chars === 0) return;
    let active = true;
    const timer = setTimeout(() => {
      void pipeline
        .estimate({
          chars,
          sourceLang: sourceLang ?? null,
          targetLang: targetLang ?? null,
        })
        .then((result: CostEstimate) => {
          if (active) setEstimateOutcome({ kind: 'ready', estimate: result });
        })
        .catch(() => {
          if (active) setEstimateOutcome({ kind: 'error' });
        });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pipeline, chars, sourceLang, targetLang, estimateRetry]);

  // Recomputes the estimate for the current source. A failed estimate goes back to loading at once.
  const retryEstimate = useCallback(() => {
    setEstimateOutcome((previous) => (previous?.kind === 'error' ? null : previous));
    setEstimateRetry((count) => count + 1);
  }, []);

  // The last estimate stays on screen while the next one is worked out, so the figure does not flicker.
  const estimate: EstimateStatus =
    chars === 0
      ? { kind: 'idle' }
      : estimateOutcome === null
        ? { kind: 'loading' }
        : estimateOutcome.kind === 'ready'
          ? { kind: 'ready', estimate: estimateOutcome.estimate }
          : { kind: 'error' };

  const linkReady = readyPreview !== null && readyPreview.quality !== 'empty';
  // A cost the catalogue could not price is not a price: creating then needs an explicit yes.
  const priceUnknown = estimate.kind === 'ready' && isEstimateUnknown(estimate.estimate);
  const gate = {
    mode,
    linkReady,
    hasFile: file !== null,
    textLength: text.trim().length,
    title,
    creating,
  };
  const canCreate = canCreateChapter(gate);
  const blockedCopy = canCreate ? null : createBlockedCopy(gate);

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const source =
        mode === 'link'
          ? { kind: 'url' as const, url: url.trim() }
          : mode === 'pdf' && file
            ? { kind: 'pdf' as const, fileUri: file.uri, fileName: file.name }
            : { kind: 'text' as const, text: text.trim(), label: title.trim() };
      const chapterId = await pipeline.createChapter({ seriesId, title: title.trim(), source });
      pipeline.enqueue(chapterId);
      goBackOrHome();
    } catch {
      setCreateError("We couldn't save this chapter. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset) {
        // Refused here, before the file is read: a PDF over the limit never reaches the pipeline.
        if (asset.size !== undefined && asset.size > PDF_MAX_BYTES) {
          setFile(null);
          setCreateError(pdfTooLargeMessage(asset.size));
          return;
        }
        setCreateError(null);
        setFile({ uri: asset.uri, name: asset.name, size: asset.size ?? 0 });
        if (!titleEdited) setTitle(titleFromFileName(asset.name));
      }
    } catch {
      setCreateError("We couldn't open that file. Choose it again.");
    }
  };

  const onTitleChange = (value: string) => {
    setTitleEdited(true);
    setTitle(value);
  };

  const onTextChange = (value: string) => {
    setText(value);
    if (!titleEdited) setTitle(titleFromText(value));
  };

  const problem = mode === 'link' ? urlProblem(url) : null;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl
          label="Source type"
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
        />

        {mode === 'link' ? (
          <View style={styles.section}>
            <TextField
              label="Article link"
              value={url}
              onChangeText={setUrl}
              placeholder="https://"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              error={problem ?? undefined}
              helper={problem ? undefined : 'Paste the address of a page you want to listen to.'}
            />
            {clipboardUrl && url === '' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Paste ${clipboardUrl} from the clipboard`}
                onPress={() => setUrl(clipboardUrl)}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
                ]}
              >
                <ClipboardPaste
                  size={iconSize.sm}
                  strokeWidth={iconStrokeWidth}
                  color={colors.accent}
                />
                <Text variant="caption" numberOfLines={1} style={styles.chipText}>
                  {`Paste ${clipboardUrl}`}
                </Text>
              </Pressable>
            ) : null}
            <LinkStatus link={link} onRetry={() => setRetryToken((value) => value + 1)} />
          </View>
        ) : null}

        {mode === 'pdf' ? (
          <View style={styles.section}>
            {file ? (
              <Card>
                <View style={styles.fileRow}>
                  <FileText
                    size={iconSize.md}
                    strokeWidth={iconStrokeWidth}
                    color={colors.accent}
                  />
                  <View style={styles.fileCopy}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {file.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatFileSize(file.size)}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" tone="muted">
                  The text is read when processing starts. A scanned PDF can be read with OCR, after
                  you confirm the cost.
                </Text>
              </Card>
            ) : null}
            <Button
              label={file ? 'Choose a different PDF' : 'Choose a PDF'}
              variant={file ? 'secondary' : 'primary'}
              icon={FileText}
              fullWidth
              onPress={() => void pickPdf()}
            />
          </View>
        ) : null}

        {mode === 'text' ? (
          <View style={styles.section}>
            <Text variant="caption" tone="muted">
              Paste the text
            </Text>
            <TextInput
              value={text}
              onChangeText={onTextChange}
              multiline
              textAlignVertical="top"
              placeholder="Paste the chapter here"
              placeholderTextColor={colors.textFaint}
              maxFontSizeMultiplier={1.2}
              accessibilityLabel="Chapter text"
              style={[
                styles.textArea,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text variant="caption" tone="faint">
              {`${Array.from(text).length.toLocaleString('en-US')} characters`}
            </Text>
          </View>
        ) : null}

        {(
          mode === 'pdf'
            ? file !== null
            : mode === 'text'
              ? text.trim() !== ''
              : readyPreview !== null
        ) ? (
          <TextField
            label="Chapter title"
            value={title}
            onChangeText={onTitleChange}
            maxLength={120}
            returnKeyType="done"
            helper={titleEdited ? undefined : 'Filled in from the source. Change it if you like.'}
          />
        ) : null}

        <EstimateCard status={estimate} onRetry={retryEstimate} />

        {createError ? (
          <Card style={styles.warning}>
            <View style={styles.fileRow}>
              <TriangleAlert
                size={iconSize.sm}
                strokeWidth={iconStrokeWidth}
                color={colors.danger}
              />
              <Text variant="caption" tone="danger" accessibilityLiveRegion="assertive">
                {createError}
              </Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Button
          label="Create & process"
          size="lg"
          fullWidth
          disabled={!canCreate}
          loading={creating}
          onPress={() => (priceUnknown ? setConfirmingUnpriced(true) : void create())}
          accessibilityHint="Creates the chapter and starts processing it"
        />
        {blockedCopy !== null ? (
          <Text variant="caption" tone="muted" align="center" testID="create-blocked-reason">
            {blockedCopy}
          </Text>
        ) : null}
      </View>
      <ConfirmSheet
        visible={confirmingUnpriced}
        title="Create without a price?"
        message="The cost is unknown for now. Processing is billed to your own OpenRouter key."
        confirmLabel="Create anyway"
        onCancel={() => setConfirmingUnpriced(false)}
        onConfirm={() => {
          setConfirmingUnpriced(false);
          void create();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function sourceChars(
  mode: SourceMode,
  preview: SourcePreview | null,
  file: PickedFile | null,
  text: string,
): number {
  if (mode === 'link')
    return preview && preview.quality !== 'empty'
      ? estimateChars({ mode, wordCount: preview.wordCount })
      : 0;
  if (mode === 'pdf') return file ? estimateChars({ mode, sizeBytes: file.size }) : 0;
  return estimateChars({ mode, text });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function LinkStatus({ link, onRetry }: { link: LinkState; onRetry: () => void }) {
  const { colors } = useTheme();
  switch (link.kind) {
    case 'idle':
      return null;
    case 'loading':
      return (
        <Card accessibilityLabel="Loading the page preview">
          <Skeleton height={space.lg} width="40%" label="Loading the page preview" />
          <Skeleton height={space.xl} />
          <Skeleton height={space.lg} width="80%" />
        </Card>
      );
    case 'error':
      return (
        <Card style={styles.warning}>
          <View style={styles.fileRow}>
            <TriangleAlert size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.danger} />
            <Text
              variant="caption"
              tone="danger"
              accessibilityLiveRegion="assertive"
              style={styles.fileCopy}
            >
              {link.message}
            </Text>
          </View>
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </Card>
      );
    case 'ready':
      if (link.preview.quality === 'empty') {
        return (
          <Card style={styles.warning}>
            <Text variant="caption" tone="danger" accessibilityLiveRegion="assertive">
              {
                "We couldn't find readable text at this link. Try another page, or paste the text instead."
              }
            </Text>
          </Card>
        );
      }
      return <SourcePreviewCard preview={link.preview} />;
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.xl,
  },
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: hairline,
  },
  section: {
    gap: space.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    minHeight: minTouchTarget,
    maxWidth: '100%',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  chipText: {
    flexShrink: 1,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  fileCopy: {
    flex: 1,
    gap: space.xxs,
  },
  textArea: {
    minHeight: 200,
    borderRadius: radius.md,
    borderWidth: hairline,
    padding: space.md,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
  },
  warning: {
    gap: space.md,
  },
});
