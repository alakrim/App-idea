import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from './motion';
import { useTheme } from './theme';
import { easingCurve, radius, transparent, type RadiusToken } from './tokens';

const SHIMMER_PERIOD_MS = 1400;

export interface SkeletonProps {
  width?: ViewStyle['width'];
  height: number;
  radius?: RadiusToken;
  /** Announced as the loading label for screen readers. Omit for purely decorative blocks. */
  label?: string;
  style?: ViewStyle;
}

/** Loading placeholder with a shimmer. Under reduce motion it stays still. */
export function Skeleton({
  width = '100%',
  height,
  radius: radiusToken = 'md',
  label,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const sweep = useSharedValue(0);
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(sweep);
      sweep.value = 0;
      return;
    }
    sweep.value = withRepeat(
      withTiming(1, { duration: SHIMMER_PERIOD_MS, easing: Easing.bezier(...easingCurve) }),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);

  const shimmerStyle = useAnimatedStyle(() => {
    const travel = trackWidth.value;
    return { transform: [{ translateX: -travel + sweep.value * travel * 2 }] };
  });

  return (
    <View
      accessible={Boolean(label)}
      accessibilityRole={label ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityState={label ? { busy: true } : undefined}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width;
      }}
      style={[
        styles.track,
        { width, height, borderRadius: radius[radiusToken], backgroundColor: colors.surfaceRaised },
        style,
      ]}
    >
      {reduced ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
          <LinearGradient
            colors={[transparent, colors.shimmer, transparent]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
});
