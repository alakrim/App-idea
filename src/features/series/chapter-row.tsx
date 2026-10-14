import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Chapter, PipelineError } from '@/core/domain';
import type { ListeningProgress } from '@/core/playback/listening-progress';
import { isScannedPdfFailure, rowStateOf, statusLine } from '@/features/chapter/chapter-status';
import { StageStepper } from '@/features/chapter/stage-stepper';
import { stepStates } from '@/features/chapter/stage-steps';
import type { ChapterProgress } from '@/features/pipeline/facade';
import { formatUsd } from '@/features/shared/format';
import { useNow } from '@/features/shared/use-now';
import { Button } from '@/ui/button';
import { IconButton } from '@/ui/icon-button';
import { Check, Ellipsis, Play } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  hairline,
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  opacity,
  radius,
  space,
} from '@/ui/tokens';

import {
  CHAPTER_ACTION_LABELS,
  chapterActionFrom,
  chapterActionsFor,
  type ChapterAction,
  type ChapterAvailability,
} from './chapter-actions';
import { ListeningBar } from './listening-bar';
import { listeningShortLabel, listeningSpokenLabel } from './listening-copy';

const NUMBER_WIDTH = space.xl;
/** How often a processing row refreshes its elapsed time. */
const LIVE_TICK_MS = 1000;

export interface ChapterRowProps {
  /** 1-based position in the series. */
  number: number;
  chapter: Chapter;
  progress: ChapterProgress | null;
  failure: PipelineError | null;
  /** Estimated cost of the OCR retry, for a scanned PDF. Null while it is being worked out. */
  ocrUsd: number | null;
  /** How much of this chapter the listener has heard. */
  listening: ListeningProgress;
  /** True for the chapter the listener is on, which gets a "Now" marker. */
  current: boolean;
  /** Hairline above the row, for every row but the first. */
  divided: boolean;
  /** Which actions the chapter offers now. The same list backs the menu and the accessibility actions. */
  availability: ChapterAvailability;
  onOpen: (chapterId: string) => void;
  onPlay: (chapterId: string) => void;
  /** Opens the chapter's action menu: the visible ⋯ button and a long press both use it. */
  onMenu: (chapterId: string) => void;
  /** Runs one action directly, for screen-reader users who pick it from the row's actions. */
  onAction: (chapterId: string, action: ChapterAction) => void;
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
  listening,
  current,
  divided,
  availability,
  onOpen,
  onPlay,
  onMenu,
  onAction,
  onRetry,
  onOcr,
}: ChapterRowProps) {
  const { colors } = useTheme();
  const state = rowStateOf(chapter, progress);
  const now = useNow(LIVE_TICK_MS, state === 'processing');
  const line = statusLine(state, chapter, progress, failure, now);
  const scanned = isScannedPdfFailure(chapter, failure);
  const showSteps = state === 'processing' || state === 'failed';
  const isReady = state === 'ready';
  const short = isReady ? listeningShortLabel(listening) : null;
  const spoken = isReady ? listeningSpokenLabel(listening) : null;
  const showBar = isReady && listening.kind === 'in-progress';
  const showListening = isReady && (current || listening.kind !== 'unstarted');
  const actions = chapterActionsFor(availability);
  const accessibilityLabel = [
    `Chapter ${number}, ${chapter.title}, ${line}`,
    spoken,
    current ? 'now playing' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

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
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Opens the chapter. More actions are in the menu."
          accessibilityActions={actions.map((action) => ({
            name: action,
            label: CHAPTER_ACTION_LABELS[action],
          }))}
          onAccessibilityAction={(event) => {
            const action = chapterActionFrom(event.nativeEvent.actionName);
            if (action !== null) onAction(chapter.id, action);
          }}
          delayLongPress={350}
          onPress={() => onOpen(chapter.id)}
          onLongPress={() => onMenu(chapter.id)}
          style={({ pressed }) => [styles.press, pressed ? { opacity: opacity.pressed } : null]}
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
            {showBar && listening.kind === 'in-progress' ? (
              <ListeningBar fraction={listening.fraction} />
            ) : null}
            {showListening ? (
              <View style={styles.listeningLine}>
                {current ? (
                  <View style={[styles.nowPill, { backgroundColor: colors.accentSoft }]}>
                    <Text variant="micro">Now</Text>
                  </View>
                ) : null}
                {listening.kind === 'finished' ? (
                  <View style={styles.finished}>
                    <Check
                      size={iconSize.sm}
                      strokeWidth={iconStrokeWidth}
                      color={colors.success}
                    />
                    <Text variant="caption" tone="success">
                      Finished
                    </Text>
                  </View>
                ) : short !== null ? (
                  <Text variant="caption" tone="muted">
                    {short}
                  </Text>
                ) : null}
              </View>
            ) : null}
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
        <IconButton
          label={`More actions for chapter ${number}`}
          icon={Ellipsis}
          variant="surface"
          onPress={() => onMenu(chapter.id)}
        />
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
              label={
                ocrUsd === null
                  ? 'Read scanned pages'
                  : `Read scanned pages (≈ ${formatUsd(ocrUsd)})`
              }
              variant="secondary"
              onPress={() => onOcr(chapter.id)}
              accessibilityHint="Reads the text in the scanned pages. Asks for confirmation first."
            />
          ) : null}
          <Button label="Try again" variant="secondary" onPress={() => onRetry(chapter.id)} />
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
  listeningLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  nowPill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  finished: {
    flexDirection: 'row',
    alignItems: 'center',
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
