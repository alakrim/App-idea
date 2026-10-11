import { useReducedMotion, withSpring, withTiming } from 'react-native-reanimated';

import { springs, type SpringToken } from './tokens';

/**
 * Motion helpers that respect the OS reduce-motion setting. With reduce motion on, springs become
 * an instant change.
 */
export function useMotion() {
  const reduced = useReducedMotion();

  return {
    reduced,
    /** Spring to a value, or jump straight there when reduce motion is on. */
    springTo: (value: number, token: SpringToken = 'snappy') =>
      reduced ? withTiming(value, { duration: 0 }) : withSpring(value, springs[token]),
  };
}
