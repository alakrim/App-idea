import { Pressable, StyleSheet, View } from 'react-native';

import { Check } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, radius, space } from '@/ui/tokens';

import { formatHourlyCost, providerLabel } from './format';
import { displayName } from './model-search';

import type { VoiceTier, VoiceTierId } from './voice-tiers';

const TIER_NAMES: Readonly<Record<VoiceTierId, string>> = {
  budget: 'Budget',
  recommended: 'Recommended',
  premium: 'Premium',
};

export interface VoiceTierCardProps {
  tier: VoiceTier;
  selected: boolean;
  onSelect: () => void;
}

/** One narration tier: the model it stands for, and its live hourly cost. */
export function VoiceTierCard({ tier, selected, onSelect }: VoiceTierCardProps) {
  const { colors } = useTheme();
  const name = displayName(tier.model);
  const cost = formatHourlyCost(tier.usdPerHour);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${TIER_NAMES[tier.id]} voice, ${name}, ${cost} of narration`}
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
        <View style={styles.titleLine}>
          <Text variant="micro" tone={selected ? 'accent' : 'faint'}>
            {TIER_NAMES[tier.id]}
          </Text>
        </View>
        <Text variant="heading" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="muted">
          {`${providerLabel(tier.model.id)} · ${cost} of narration`}
        </Text>
      </View>
      {selected ? (
        <Check size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
      ) : null}
    </Pressable>
  );
}

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
        <Text variant="micro" tone={selected ? 'accent' : 'faint'}>
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
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
