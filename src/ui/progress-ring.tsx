import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from './text';
import { useTheme } from './theme';
import { progressRing, transparent } from './tokens';

export interface ProgressRingProps {
  /** 0 to 1. Out-of-range values are clamped. */
  progress: number;
  /** Accessible name, for example "Narration progress". */
  label: string;
  size?: number;
  strokeWidth?: number;
  tone?: 'accent' | 'success' | 'danger';
  /** Shows the percentage inside the ring. Off by default because rings in lists stay small. */
  showValue?: boolean;
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.min(1, Math.max(0, progress));
}

export function ProgressRing({
  progress,
  label,
  size = progressRing.size,
  strokeWidth = progressRing.strokeWidth,
  tone = 'accent',
  showValue = false,
}: ProgressRingProps) {
  const { colors } = useTheme();
  const value = clampProgress(progress);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.round(value * 100);
  const toneColor = tone === 'accent' ? colors.accent : colors[tone];

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.box, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={styles.rotate}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={transparent}
          stroke={colors.border}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={transparent}
          stroke={toneColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - value)}
        />
      </Svg>
      {showValue ? (
        <Text variant="micro" style={styles.value}>
          {`${percent}%`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotate: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
  value: {
    textAlign: 'center',
  },
});
