import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { selectionHaptic } from './haptics';
import { useMotion } from './motion';
import { Text } from './text';
import { useTheme } from './theme';
import { hairline, minTouchTarget, opacity, radius, space } from './tokens';

export interface SliderProps {
  /** Accessible name, such as "Ambience level". */
  label: string;
  value: number;
  min: number;
  max: number;
  /** Snap increment. Defaults to 1. */
  step?: number;
  /** Fires while dragging, once per step crossed. Ticks a selection haptic. */
  onValueChange: (value: number) => void;
  /** Fires once the user lifts a finger or uses an accessibility action. */
  onValueCommit?: (value: number) => void;
  /** Spoken value, such as "−22 dB". Defaults to the number. */
  formatValue?: (value: number) => string;
  /** Optional caption under the left and right ends, such as "Subtle" and "Present". */
  minimumLabel?: string;
  maximumLabel?: string;
  disabled?: boolean;
  testID?: string;
}

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 24;
const THUMB_RING = 3;

/** Clamps `raw` to [min, max] and snaps it to the nearest step from `min`. Pure, so it is testable. */
export function snapValue(raw: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, raw));
  const snapped = min + Math.round((clamped - min) / step) * step;
  // Rounding can overshoot the end by a fraction of a step when `max - min` is not a multiple.
  const bounded = Math.min(max, Math.max(min, snapped));
  return Number(bounded.toFixed(6));
}

/** Position in [0, 1] of the touch at `x` on a track `width` wide. Runs on the UI thread. */
function fractionAt(x: number, width: number): number {
  'worklet';
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, x / width));
}

/**
 * Accessible slider on gesture-handler and Reanimated. Dragging moves the thumb on the UI thread
 * and reports snapped values. Screen readers get an adjustable role with increment and decrement.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onValueCommit,
  formatValue = (next) => String(next),
  minimumLabel,
  maximumLabel,
  disabled = false,
  testID,
}: SliderProps) {
  const { colors } = useTheme();
  const { springTo } = useMotion();
  const width = useSharedValue(0);
  const fraction = useSharedValue(toFraction(value, min, max));
  const lastEmitted = useRef(value);

  useEffect(() => {
    lastEmitted.current = value;
    // Follow external changes (presets, resets) with a spring, not a jump.
     
    fraction.value = springTo(toFraction(value, min, max), 'gentle');
     
  }, [value, min, max, fraction, springTo]);

  const emit = useMemo(
    () => (nextFraction: number, commit: boolean) => {
      const next = snapValue(min + nextFraction * (max - min), min, max, step);
      if (next !== lastEmitted.current) {
        lastEmitted.current = next;
        selectionHaptic();
        onValueChange(next);
      }
      if (commit) {
        onValueCommit?.(lastEmitted.current);
      }
    },
    [min, max, step, onValueChange, onValueCommit],
  );

  // Gesture callbacks run on the UI thread, where shared values are written by design.
  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .minDistance(0)
        .onBegin((event) => {
          fraction.value = fractionAt(event.x, width.value);
          runOnJS(emit)(fraction.value, false);
        })
        .onUpdate((event) => {
          fraction.value = fractionAt(event.x, width.value);
          runOnJS(emit)(fraction.value, false);
        })
        .onEnd(() => {
          runOnJS(emit)(fraction.value, true);
        }),
    [disabled, emit, fraction, width],
  );
  /* eslint-enable react-hooks/refs, react-hooks/immutability */

  const fillStyle = useAnimatedStyle(() => ({
    width: fraction.value * width.value,
  }));

  // The thumb stays hidden until the track has been measured, so it never flashes at the left edge.
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: width.value > 0 ? 1 : 0,
    transform: [{ translateX: fraction.value * width.value - THUMB_SIZE / 2 }],
  }));

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (disabled || (actionName !== 'increment' && actionName !== 'decrement')) return;
    const direction = actionName === 'increment' ? 1 : -1;
    const next = snapValue(lastEmitted.current + direction * step, min, max, step);
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    /* eslint-disable-next-line react-hooks/immutability */
    fraction.value = toFraction(next, min, max);
    selectionHaptic();
    onValueChange(next);
    onValueCommit?.(next);
  };

  const hasCaptions = minimumLabel !== undefined || maximumLabel !== undefined;

  return (
    <View style={[styles.wrapper, disabled ? styles.disabled : null]} testID={testID}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={handleAccessibilityAction}
          onLayout={(event) => {
            /* eslint-disable-next-line react-hooks/immutability */
            width.value = event.nativeEvent.layout.width;
          }}
          style={styles.hitArea}
        >
          <View
            style={[
              styles.track,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                backgroundColor: colors.accent,
                borderColor: colors.bg,
              },
              thumbStyle,
            ]}
          />
        </Animated.View>
      </GestureDetector>
      {hasCaptions ? (
        <View style={styles.captions} accessibilityElementsHidden importantForAccessibility="no">
          <Text variant="caption" tone="faint">
            {minimumLabel ?? ''}
          </Text>
          <Text variant="caption" tone="faint">
            {maximumLabel ?? ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function toFraction(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space.xs,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  hitArea: {
    height: minTouchTarget,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (minTouchTarget - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.pill,
    borderWidth: THUMB_RING,
  },
  captions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
