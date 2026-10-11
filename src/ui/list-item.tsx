import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ChevronRight } from '@/ui/icons';
import type { LucideIcon } from '@/ui/icons';

import { Text } from './text';
import { useTheme } from './theme';
import { iconSize, iconStrokeWidth, minTouchTarget, radius, space } from './tokens';

import type { ReactNode } from 'react';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  leading?: LucideIcon;
  /** Replaces the default chevron, which only appears on pressable rows. */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
  style?: ViewStyle;
}

export function ListItem({
  title,
  subtitle,
  leading: Leading,
  trailing,
  onPress,
  accessibilityHint,
  testID,
  style,
}: ListItemProps) {
  const { colors } = useTheme();
  const accessibilityLabel = subtitle ? `${title}, ${subtitle}` : title;

  const content = (
    <>
      {Leading ? (
        <View style={[styles.leading, { backgroundColor: colors.accentSoft }]}>
          <Leading size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? (
          <ChevronRight size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.textFaint} />
        ) : null)}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[styles.row, style]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceRaised } : null,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouchTarget + space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  leading: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
});
