import { Pressable, StyleSheet, View } from 'react-native';

import type { LucideIcon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

export interface ChipProps {
  label: string;
  /** Spoken name. Defaults to the visible label. */
  accessibilityLabel?: string;
  hint?: string;
  icon?: LucideIcon;
  /** Highlights the chip, such as an active sleep timer or repeat. */
  active?: boolean;
  /**
   * The chip's current setting, such as 'On' or '1.25×', for a chip that opens a sheet. It is read as
   * a value, not as a selection, so a chip that only opens something is never announced as selected.
   */
  value?: string;
  onPress?: () => void;
  testID?: string;
}

/** A pill-shaped control on the player: speed, sleep, ambience and repeat. Minimum touch target tall. */
export function Chip({
  label,
  accessibilityLabel,
  hint,
  icon: Icon,
  active = false,
  value,
  onPress,
  testID,
}: ChipProps) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.content}>
      {Icon ? (
        <Icon
          size={iconSize.sm}
          strokeWidth={iconStrokeWidth}
          color={active ? colors.accent : colors.textMuted}
        />
      ) : null}
      <Text
        variant="caption"
        tone={active ? 'onAccentSoft' : 'muted'}
        numberOfLines={1}
        style={styles.label}
        importantForAccessibility="no"
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={value === undefined ? { selected: active } : undefined}
      accessibilityValue={value === undefined ? undefined : { text: value }}
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accentSoft : colors.surfaceRaised,
          borderColor: active ? colors.accent : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: minTouchTarget,
    maxWidth: '100%',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  label: {
    flexShrink: 1,
  },
});
