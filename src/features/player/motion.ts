import { useEffect } from 'react';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useMotion } from '@/ui/motion';
import { easingCurve } from '@/ui/tokens';

import { PLAYER } from './layout';

const EASE = Easing.bezier(...easingCurve);

/** The animation that takes a value to `target`: a short glide, or an instant jump under reduce motion. */
export function glideTo(target: number, reduced: boolean, durationMs: number = PLAYER.glideMs) {
  return reduced ? target : withTiming(target, { duration: durationMs, easing: EASE });
}

/**
 * A shared value that glides to `target` between engine updates, so a position that arrives at
 * 4 Hz still moves smoothly on screen. With reduce motion on it jumps.
 */
export function useGlide(target: number, durationMs: number = PLAYER.glideMs): SharedValue<number> {
  const { reduced } = useMotion();
  const value = useSharedValue(target);
  useEffect(() => {
    value.value = glideTo(target, reduced, durationMs);
  }, [target, reduced, durationMs, value]);
  return value;
}
