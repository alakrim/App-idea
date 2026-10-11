import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '@/ui/motion';
import { useTheme } from '@/ui/theme';
import { hairline, radius, space } from '@/ui/tokens';

/** Stacked page cards that morph into a narration waveform, drawn from tokens only. */
const STAGE_HEIGHT = 168;
const PAGE_WIDTH = 112;
const PAGE_HEIGHT = 136;
const BAR_WIDTH = 6;
const BAR_GAP = space.xs + space.xxs;
/** Relative heights of the waveform bars, from left to right. */
const WAVE_SHAPE = [0.32, 0.55, 0.78, 0.46, 1, 0.66, 0.9, 0.4, 0.7, 0.5, 0.28] as const;
const WAVE_MAX_HEIGHT = 96;
const LOOP_MS = 2800;

/** Each bar starts its morph a little after the one on its left, so the change ripples. */
function stagedProgress(morph: number, index: number): number {
  'worklet';
  const start = index * 0.04;
  const span = 1 - WAVE_SHAPE.length * 0.04;
  return Math.min(1, Math.max(0, (morph - start) / span));
}

export function WelcomeIllustration() {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const morph = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      morph.value = 1;
      return;
    }
    morph.value = withRepeat(
      withTiming(1, { duration: LOOP_MS, easing: Easing.bezier(0.2, 0, 0, 1) }),
      -1,
      true,
    );
  }, [morph, reduced]);

  return (
    <View style={styles.stage} accessible={false} importantForAccessibility="no">
      {[0, 1, 2].map((index) => (
        <PageCard key={index} index={index} morph={morph} />
      ))}
      <View style={styles.waveform}>
        {WAVE_SHAPE.map((shape, index) => (
          <WaveBar key={index} index={index} shape={shape} morph={morph} color={colors.accent} />
        ))}
      </View>
    </View>
  );
}

/** One of three page cards. They fan out at rest and fold into the waveform as it morphs. */
function PageCard({ index, morph }: { index: number; morph: { value: number } }) {
  const { colors } = useTheme();
  const offset = index - 1;

  const style = useAnimatedStyle(() => {
    const m = morph.value;
    return {
      opacity: interpolate(m, [0, 0.6, 1], [1, 0.25, 0]),
      transform: [
        { translateX: offset * 18 * (1 - m) },
        { rotate: `${offset * -5 * (1 - m)}deg` },
        { scale: 1 - m * 0.2 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.page,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border, zIndex: index },
        style,
      ]}
    >
      <View style={[styles.line, styles.lineShort, { backgroundColor: colors.textFaint }]} />
      <View style={[styles.line, { backgroundColor: colors.textFaint }]} />
      <View style={[styles.line, { backgroundColor: colors.textFaint }]} />
      <View style={[styles.line, styles.lineShort, { backgroundColor: colors.textFaint }]} />
    </Animated.View>
  );
}

function WaveBar({
  index,
  shape,
  morph,
  color,
}: {
  index: number;
  shape: number;
  morph: { value: number };
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = stagedProgress(morph.value, index);
    return {
      opacity: p,
      height: BAR_WIDTH + (WAVE_MAX_HEIGHT * shape - BAR_WIDTH) * p,
      borderRadius: radius.pill,
    };
  });

  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  stage: {
    height: STAGE_HEIGHT,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    position: 'absolute',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
    gap: space.sm,
    justifyContent: 'flex-start',
  },
  line: {
    height: space.xs,
    borderRadius: radius.pill,
    opacity: 0.6,
  },
  lineShort: {
    width: '60%',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    height: WAVE_MAX_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
  },
});
