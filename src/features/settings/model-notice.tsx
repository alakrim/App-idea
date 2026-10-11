import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Info, TriangleAlert } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, radius, space } from '@/ui/tokens';

export interface ModelNoticeProps {
  tone: 'neutral' | 'warning';
  message: string;
  action?: { label: string; onPress: () => void };
}

/** A calm notice for picker state: offline snapshots, or a saved model that disappeared. */
export function ModelNotice({ tone, message, action }: ModelNoticeProps) {
  const { colors } = useTheme();
  const warning = tone === 'warning';
  const Icon = warning ? TriangleAlert : Info;
  const iconColor = warning ? colors.warning : colors.textMuted;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.box,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: warning ? colors.warning : colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        <Icon size={iconSize.sm} strokeWidth={iconStrokeWidth} color={iconColor} />
        <Text variant="caption" tone={warning ? 'warning' : 'muted'} style={styles.message}>
          {message}
        </Text>
      </View>
      {action ? <Button label={action.label} variant="secondary" onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  message: {
    flex: 1,
  },
});
