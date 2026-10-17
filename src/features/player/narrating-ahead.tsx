import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '@/ui/motion';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

import { NARRATING_AHEAD_COPY } from './ahead-state';

const PULSE_MS = 900;
const DOT_SIZE = 6;
/** The dot never fades out completely, so it stays visible as a status mark. */
const DIM_OPACITY = 0.35;

/**
 * The calm wait shown in the transport while narration catches up with playback. A slow pulse, no
 * colour of alarm. With reduced motion the dot stays still.
 */
export function NarratingAhead() {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      pulse.value = 1;
      return undefined;
    }
    pulse.value = withRepeat(withTiming(1, { duration: PULSE_MS }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: DIM_OPACITY + (1 - DIM_OPACITY) * pulse.value,
    transform: [{ scale: 0.8 + 0.2 * pulse.value }],
  }));

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={NARRATING_AHEAD_COPY}
      accessibilityLiveRegion="polite"
      testID="narrating-ahead"
      style={styles.row}
    >
      <Animated.View style={[styles.dot, { backgroundColor: colors.accent }, dotStyle]} />
      <Text variant="caption" tone="muted">
        {NARRATING_AHEAD_COPY}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
