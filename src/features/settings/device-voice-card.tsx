import { Pressable, StyleSheet, View } from 'react-native';

import { Check } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, radius, space } from '@/ui/tokens';

export interface DeviceVoiceCardProps {
  selected: boolean;
  onSelect: () => void;
}

/** The free, offline option: the phone's own speech engine. It speaks live and cannot be exported. */
export function DeviceVoiceCard({ selected, onSelect }: DeviceVoiceCardProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel="Device voice, free and offline"
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.copy}>
        <Text variant="micro" tone={selected ? 'onAccentSoft' : 'faint'}>
          Free
        </Text>
        <Text variant="heading">Device voice</Text>
        <Text variant="caption" tone="muted">
          Works offline. Speaks as you listen, so it cannot be saved as audio.
        </Text>
      </View>
      {selected ? (
        <Check size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  pressed: {
    opacity: 0.9,
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
});
