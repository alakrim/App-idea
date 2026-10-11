import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useMotion } from './motion';
import { pressScale } from './tokens';

/** Press feedback: the surface shrinks to `pressScale` on press-in and springs back on release. */
export function usePressScale() {
  const { springTo } = useMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return {
    animatedStyle,
    // Shared values are mutated from press handlers by design. Reanimated runs the animation on the UI thread.
    /* eslint-disable react-hooks/immutability */
    onPressIn: () => {
      scale.value = springTo(pressScale, 'snappy');
    },
    onPressOut: () => {
      scale.value = springTo(1, 'snappy');
    },
    /* eslint-enable react-hooks/immutability */
  };
}
