import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { selectionHaptic } from '@/ui/haptics';
import { useMotion } from '@/ui/motion';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, radius, space } from '@/ui/tokens';

import { describeDuration, formatClock, formatRemaining } from './format';
import { PLAYER } from './layout';
import { glideTo } from './motion';
import { usePlayback, usePlaybackContent, usePlayerState } from './player-provider';
import {
  SCRUB_STEP_MS,
  fractionToMs,
  msToFraction,
  scrubFraction,
  scrubSensitivity,
  scrubStep,
} from './scrub';

export interface ScrubberProps {
  positionMs: number;
  durationMs: number;
  /** Start of each sentence on the timeline, drawn as faint ticks. */
  tickMs: readonly number[];
  /** Asks for a seek to an absolute media time. Fires once, when the listener lets go. */
  onSeek: (ms: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

interface ScrubberTicksProps {
  tickMs: readonly number[];
  durationMs: number;
  color: string;
}

/**
 * The sentence ticks. They depend only on the timeline, so they are drawn once per timeline and
 * are not redrawn as the position moves (P2-10).
 */
const ScrubberTicks = memo(function ScrubberTicks({
  tickMs,
  durationMs,
  color,
}: ScrubberTicksProps) {
  return (
    <>
      {tickMs.map((ms, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.tick,
            {
              left: `${clamp((ms / Math.max(1, durationMs)) * 100, 0, 100)}%`,
              backgroundColor: color,
            },
          ]}
        />
      ))}
    </>
  );
});

interface ScrubberLabelsProps {
  shownMs: number;
  durationMs: number;
}

/** The elapsed and remaining clock. Only this small part follows the position every tick. */
const ScrubberLabels = memo(function ScrubberLabels({ shownMs, durationMs }: ScrubberLabelsProps) {
  return (
    <View style={styles.labels} importantForAccessibility="no-hide-descendants">
      <Text variant="caption" tone="muted" style={styles.tabular}>
        {formatClock(shownMs)}
      </Text>
      <Text variant="caption" tone="muted" style={styles.tabular}>
        {formatRemaining(durationMs - shownMs)}
      </Text>
    </View>
  );
});

/**
 * The scrubber wired to the playback store. It is the only part of the player that follows the
 * position every tick, so the rest of the full player does not re-render with it (P2-10).
 */
export function PlayerScrubber() {
  const controller = usePlayback();
  const positionMs = usePlayerState((state) => state.positionMs);
  const timeline = usePlaybackContent((content) => content.timeline);
  const durationMs = timeline?.totalDurationMs ?? 0;
  const tickMs = useMemo(
    () =>
      timeline
        ? Array.from({ length: timeline.sentenceCount }, (_, idx) =>
            timeline.sentenceToPosition(idx),
          )
        : [],
    [timeline],
  );
  const onSeek = useCallback((ms: number) => controller.seekToMs(ms), [controller]);
  return (
    <Scrubber positionMs={positionMs} durationMs={durationMs} tickMs={tickMs} onSeek={onSeek} />
  );
}

/**
 * The chapter timeline as a scrubber. Dragging is relative to where the finger lands, and dragging
 * down away from the track slows it, so long chapters can be placed to the second. The seek is
 * sent on release, so the audio never stutters under the finger. Screen readers get an adjustable
 * control that steps 15 s.
 */
export function Scrubber({ positionMs, durationMs, tickMs, onSeek }: ScrubberProps) {
  const { colors } = useTheme();
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  const shownMs = previewMs ?? positionMs;
  const enabled = durationMs > 0;
  const tickColor = colors.decorativeFaint;

  const width = useSharedValue(0);
  const scrubbing = useSharedValue(false);
  const anchor = useSharedValue(0);
  const { reduced } = useMotion();
  const fraction = useSharedValue(msToFraction(positionMs, durationMs));
  const targetFraction = msToFraction(positionMs, durationMs);
  const durationShared = useSharedValue(durationMs);
  const reportedMs = useSharedValue(-1);
  const lastStep = useSharedValue(-1);

  useEffect(() => {
    durationShared.value = durationMs;
  }, [durationMs, durationShared]);

  // The thumb follows the playing position, but never while the finger is on it: engine updates
  // keep arriving during a drag and must not pull the thumb away from the finger.
  useEffect(() => {
    if (scrubbing.value) return;

    fraction.value = glideTo(targetFraction, reduced);
  }, [targetFraction, reduced, fraction, scrubbing]);

  const showPreview = useCallback((ms: number | null) => setPreviewMs(ms), []);
  const haptic = useCallback(() => selectionHaptic(), []);
  const commit = useCallback(
    (ms: number) => {
      onSeek(ms);
    },
    [onSeek],
  );

  // Shared values are written from gesture callbacks by design: they run on the UI thread.
  /* eslint-disable react-hooks/immutability */
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .minDistance(0)
        .onBegin((event) => {
          const start = width.value > 0 ? clamp(event.x / width.value, 0, 1) : 0;
          scrubbing.value = true;
          anchor.value = start;
          fraction.value = start;
          runOnJS(showPreview)(Math.round(start * durationShared.value));
        })
        .onUpdate((event) => {
          const next = scrubFraction(
            anchor.value,
            event.translationX,
            width.value,
            scrubSensitivity(event.translationY),
          );
          fraction.value = next;
          // Labels update once per second, not per frame, to keep the JS thread quiet.
          const ms = Math.round((next * durationShared.value) / 1000) * 1000;
          if (ms !== reportedMs.value) {
            reportedMs.value = ms;
            runOnJS(showPreview)(ms);
          }
          const step = scrubStep(ms);
          if (step !== lastStep.value) {
            lastStep.value = step;
            runOnJS(haptic)();
          }
        })
        .onEnd(() => {
          runOnJS(commit)(fractionToMs(fraction.value, durationShared.value));
        })
        .onFinalize(() => {
          scrubbing.value = false;
          reportedMs.value = -1;
          lastStep.value = -1;
          runOnJS(showPreview)(null);
        }),
    [
      enabled,
      width,
      scrubbing,
      anchor,
      fraction,
      durationShared,
      reportedMs,
      lastStep,
      showPreview,
      haptic,
      commit,
    ],
  );
  /* eslint-enable react-hooks/immutability */

  const fillStyle = useAnimatedStyle(() => ({ width: fraction.value * width.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: width.value > 0 ? 1 : 0,
    transform: [
      { translateX: fraction.value * width.value - PLAYER.scrubThumbSize / 2 },
      { scale: scrubbing.value ? 1.25 : 1 },
    ],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: scrubbing.value ? 1 : 0,
    transform: [
      {
        translateX: clamp(
          fraction.value * width.value - PLAYER.scrubBubbleWidth / 2,
          0,
          Math.max(0, width.value - PLAYER.scrubBubbleWidth),
        ),
      },
    ],
  }));

  /* eslint-disable react-hooks/immutability */
  const onLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
  };
  /* eslint-enable react-hooks/immutability */

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (!enabled || (actionName !== 'increment' && actionName !== 'decrement')) return;
    const delta = actionName === 'increment' ? SCRUB_STEP_MS : -SCRUB_STEP_MS;
    onSeek(clamp(positionMs + delta, 0, durationMs));
    selectionHaptic();
  };

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Chapter position"
          accessibilityHint="Swipe up or down to step 15 seconds"
          accessibilityState={{ disabled: !enabled }}
          accessibilityValue={{
            min: 0,
            max: Math.round(durationMs / 1000),
            now: Math.round(positionMs / 1000),
            text: `${describeDuration(positionMs)} of ${describeDuration(durationMs)}`,
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAccessibilityAction}
          onLayout={onLayout}
          style={styles.hitArea}
        >
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <ScrubberTicks tickMs={tickMs} durationMs={durationMs} color={tickColor} />
            <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              { backgroundColor: colors.accent, borderColor: colors.bg },
              thumbStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bubble,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              bubbleStyle,
            ]}
          >
            <Text variant="caption" style={styles.tabular}>
              {formatClock(shownMs)}
            </Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <ScrubberLabels shownMs={shownMs} durationMs={durationMs} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space.xs,
  },
  hitArea: {
    height: PLAYER.scrubHitHeight,
    justifyContent: 'center',
  },
  track: {
    height: PLAYER.scrubTrackHeight,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  tick: {
    position: 'absolute',
    top: (PLAYER.scrubTrackHeight - PLAYER.scrubTickHeight) / 2,
    width: hairline,
    height: PLAYER.scrubTickHeight,
    opacity: PLAYER.tickOpacity,
  },
  fill: {
    height: PLAYER.scrubTrackHeight,
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (PLAYER.scrubHitHeight - PLAYER.scrubThumbSize) / 2,
    width: PLAYER.scrubThumbSize,
    height: PLAYER.scrubThumbSize,
    borderRadius: radius.pill,
    borderWidth: PLAYER.scrubThumbRing,
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: -space.xl,
    width: PLAYER.scrubBubbleWidth,
    alignItems: 'center',
    paddingVertical: space.xxs,
    borderRadius: radius.sm,
    borderWidth: hairline,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
