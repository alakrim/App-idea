import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

/** A label, its current value and optional helper copy, aligned for a settings section. */
export function ValueHeading({ title, value }: { title: string; value?: string }) {
  return (
    <View style={styles.heading}>
      <Text variant="micro" tone="faint" accessibilityRole="header">
        {title}
      </Text>
      {value ? (
        <Text variant="caption" tone="accent">
          {value}
        </Text>
      ) : null}
    </View>
  );
}

export interface SwitchCardProps {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

/** A card with one on/off setting. The whole row is the switch's accessible name. */
export function SwitchCard({ title, description, value, onValueChange }: SwitchCardProps) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        </View>
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.text}
          ios_backgroundColor={colors.border}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  switchCopy: {
    flex: 1,
    gap: space.xxs,
  },
});
