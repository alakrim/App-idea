import { Play } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Chapter, PipelineError } from '@/core/domain';
import { isScannedPdfFailure, rowStateOf, statusLine } from '@/features/chapter/chapter-status';
import { StageStepper } from '@/features/chapter/stage-stepper';
import { stepStates } from '@/features/chapter/stage-steps';
import type { ChapterProgress } from '@/features/pipeline/facade';
import { formatUsd } from '@/features/shared/format';
import { Button } from '@/ui/button';
import { IconButton } from '@/ui/icon-button';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, minTouchTarget, space } from '@/ui/tokens';

const NUMBER_WIDTH = space.xl;

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

/**
 * One chapter in the series list. The title area opens the chapter and the play button sits beside
 * it, so no interactive control is nested inside another.
 */
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
    <View
      style={[
        styles.row,
        divided ? { borderTopWidth: hairline, borderTopColor: colors.border } : null,
      ]}
    >
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chapter ${number}, ${chapter.title}, ${line}`}
          accessibilityHint="Opens the chapter. Long press for more actions."
          delayLongPress={350}
          onPress={() => onOpen(chapter.id)}
          onLongPress={() => onMenu(chapter.id)}
          style={({ pressed }) => [styles.press, pressed ? { opacity: 0.85 } : null]}
        >
          <Text variant="caption" tone="faint" style={styles.number} importantForAccessibility="no">
            {String(number).padStart(2, '0')}
          </Text>
          <View style={styles.copy}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {chapter.title}
            </Text>
            <Text
              variant="caption"
              tone={state === 'failed' ? 'danger' : 'muted'}
              numberOfLines={2}
            >
              {line}
            </Text>
          </View>
        </Pressable>
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
    </View>
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
  press: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouchTarget,
  },
  number: {
    width: NUMBER_WIDTH,
    fontVariant: ['tabular-nums'],
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
  steps: {
    paddingLeft: NUMBER_WIDTH + space.md,
    paddingRight: space.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingLeft: NUMBER_WIDTH + space.md,
  },
});
