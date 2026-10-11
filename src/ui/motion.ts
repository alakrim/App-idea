import { Easing, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';

import { durations, easingCurve, springs, type SpringToken } from './tokens';

/**
 * Motion helpers that respect the OS reduce-motion setting. With reduce motion on, springs and
 * timed moves become an instant change.
 */
export function useMotion() {
  const reduced = useReducedMotion();

  return {
    reduced,
    /** Spring to a value, or jump straight there when reduce motion is on. */
    springTo: (value: number, token: SpringToken = 'snappy') =>
      reduced ? withTiming(value, { duration: 0 }) : withSpring(value, springs[token]),
    /** Timed move on the shared easing curve, or instant when reduce motion is on. */
    timeTo: (value: number, duration: keyof typeof durations = 'standard') =>
      withTiming(value, {
        duration: reduced ? 0 : durations[duration],
        easing: Easing.bezier(...easingCurve),
      }),
  };
}
