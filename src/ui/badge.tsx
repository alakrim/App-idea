import { StyleSheet, View } from 'react-native';

import { Text, type TextTone } from './text';
import { useTheme } from './theme';
import { hairline, radius, space } from './tokens';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

const TEXT_TONE: Record<BadgeTone, TextTone> = {
  neutral: 'muted',
  accent: 'onAccentSoft',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

/** Compact status pill. */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { colors } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.pill,
        {
          backgroundColor: tone === 'accent' ? colors.accentSoft : colors.surfaceRaised,
          borderColor: colors.border,
        },
      ]}
    >
      <Text variant="micro" tone={TEXT_TONE[tone]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
});
