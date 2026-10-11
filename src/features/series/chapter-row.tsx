import { Play } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Chapter, PipelineError } from '@/core/domain';
import { rowStateOf, isScannedPdfFailure, statusLine } from '@/features/chapter/chapter-status';
import { StageStepper } from '@/features/chapter/stage-stepper';
import { stepStates } from '@/features/chapter/stage-steps';
import type { ChapterProgress } from '@/features/pipeline/facade';
import { formatUsd } from '@/features/shared/format';
import { Button } from '@/ui/button';
import { IconButton } from '@/ui/icon-button';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, minTouchTarget, space } from '@/ui/tokens';

export interface ChapterRowProps {
  /** 1-based position in the series. */
  number: number;
  chapter: Chapter;
  progress: ChapterProgress | null;
  failure: PipelineError | null;
  /** Estimated cost of the OCR retry, for a scanned PDF. Null while it is being worked out. */
  ocrUsd: number | null;
  /** Hairline above the row, for every row but the first. */
  divided: boolean;
  onOpen: (chapterId: string) => void;
  onPlay: (chapterId: string) => void;
  onMenu: (chapterId: string) => void;
  onRetry: (chapterId: string) => void;
  onOcr: (chapterId: string) => void;
}

/** One chapter in the series list: number, title, status, live stepper, and the failure actions. */
export const ChapterRow = memo(function ChapterRow({
  number,
  chapter,
  progress,
  failure,
  ocrUsd,
  divided,
  onOpen,
  onPlay,
  onMenu,
  onRetry,
  onOcr,
}: ChapterRowProps) {
  const { colors } = useTheme();
  const state = rowStateOf(chapter, progress);
  const line = statusLine(state, chapter, progress, failure);
  const scanned = isScannedPdfFailure(chapter, failure);
  const showSteps = state === 'processing' || state === 'failed';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chapter ${number}, ${chapter.title}, ${line}`}
      accessibilityHint="Opens the chapter. Long press for more actions."
      delayLongPress={350}
      onPress={() => onOpen(chapter.id)}
      onLongPress={() => onMenu(chapter.id)}
      style={({ pressed }) => [
        styles.row,
        divided ? { borderTopWidth: hairline, borderTopColor: colors.border } : null,
        pressed ? { backgroundColor: colors.surfaceRaised } : null,
      ]}
    >
      <View style={styles.head}>
        <Text variant="caption" tone="faint" style={styles.number} importantForAccessibility="no">
          {String(number).padStart(2, '0')}
        </Text>
        <View style={styles.copy}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {chapter.title}
          </Text>
          <Text variant="caption" tone={state === 'failed' ? 'danger' : 'muted'} numberOfLines={2}>
            {line}
          </Text>
        </View>
        {state === 'ready' ? (
          <IconButton
            label={`Play chapter ${number}`}
            icon={Play}
            variant="surface"
            onPress={() => onPlay(chapter.id)}
          />
        ) : null}
      </View>

      {showSteps ? (
        <View style={styles.steps}>
          <StageStepper steps={stepStates(progress?.stages ?? null)} variant="compact" />
        </View>
      ) : null}

      {state === 'failed' ? (
        <View style={styles.actions}>
          {scanned ? (
            <Button
              label={ocrUsd === null ? 'Use OCR' : `Use OCR (≈ ${formatUsd(ocrUsd)})`}
              variant="secondary"
              onPress={() => onOcr(chapter.id)}
              accessibilityHint="Reads the scanned pages with OCR. Asks for confirmation first."
            />
          ) : failure?.retryable !== false ? (
            <Button label="Retry" variant="secondary" onPress={() => onRetry(chapter.id)} />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
    minHeight: minTouchTarget,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  number: {
    width: space.xl,
    fontVariant: ['tabular-nums'],
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
  steps: {
    paddingLeft: space.xl + space.md,
    paddingRight: space.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingLeft: space.xl + space.md,
  },
});
