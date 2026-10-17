import { Pressable, StyleSheet, View } from 'react-native';

import { estimateSpeechCost } from '@/core/llm/cost';
import { isLanguageSupported, type NarratorOption } from '@/core/narration/options';
import type { NarrationSettings } from '@/core/settings';
import type { OpenRouterModel } from '@/services/openrouter';
import { Badge } from '@/ui/badge';
import { selectionHaptic } from '@/ui/haptics';
import { Check } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, opacity, radius, space } from '@/ui/tokens';

import { modelLabel } from './format';
import { displayName } from './model-search';
import { narratorPreviewRequest } from './narration-choices';
import { languageLine, priceLabel, unsupportedLabel, type NarratorPrice } from './narrator-copy';
import { NarratorPreview } from './narrator-preview';
import { previewSampleFor } from './preview-sample';

export interface NarratorOptionCardProps {
  option: NarratorOption;
  /** The model's entry in the live catalogue, or null while it is unknown or not listed. */
  model: OpenRouterModel | null;
  selected: boolean;
  /** The language the narration is for. */
  lang: string;
  price: NarratorPrice;
  narration: NarrationSettings;
  /** Whether an OpenRouter key is saved, which the sample needs. */
  keyReady: boolean;
  onSelect: () => void;
}

/** One narrator: what it is, what it costs live, what it speaks, and a sample of its voice. */
export function NarratorOptionCard({
  option,
  model,
  selected,
  lang,
  price,
  narration,
  keyReady,
  onSelect,
}: NarratorOptionCardProps) {
  const { colors } = useTheme();
  const available = isLanguageSupported(option, lang);
  const modelName = model ? displayName(model) : modelLabel(option.modelId);
  const priceText = priceLabel(price);
  const free = price.status === 'known' && price.usdPerHour <= 0;

  const sample = previewSampleFor(lang);
  const previewRequest =
    model && available
      ? narratorPreviewRequest(option, {
          narration,
          lang,
          voices: model.supportedVoices,
          sample,
          estimateUsd: estimateSpeechCost(model, sample.text.length),
        })
      : null;

  const choose = () => {
    selectionHaptic();
    onSelect();
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={`${option.label} narrator, ${modelName}, ${priceText}${available ? '' : `, ${unsupportedLabel(lang)}`}`}
        accessibilityState={{ checked: selected, disabled: !available }}
        disabled={!available}
        onPress={choose}
        style={({ pressed }) => [styles.choice, pressed && available ? styles.pressed : null]}
      >
        <View style={styles.head}>
          <Text
            variant="micro"
            tone={selected ? 'onAccentSoft' : 'muted'}
            numberOfLines={1}
            style={styles.headName}
          >
            {modelName}
          </Text>
          {selected ? (
            <Check size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
          ) : null}
        </View>
        <Text variant="heading">{option.label}</Text>
        <Text variant="body" tone="muted">
          {option.tagline}
        </Text>
      </Pressable>

      <View style={styles.facts}>
        <Text variant="bodyStrong" tone={free ? 'success' : 'default'}>
          {priceText}
        </Text>
        <Text variant="caption" tone="muted">
          {languageLine(option)}
        </Text>
        {available ? null : <Badge label={unsupportedLabel(lang)} tone="warning" />}
        <Text variant="caption" tone="muted">
          {option.notes}
        </Text>
      </View>

      {available && !keyReady ? (
        <Text variant="caption" tone="muted">
          Connect OpenRouter to hear a sample.
        </Text>
      ) : null}
      {available && keyReady && previewRequest ? (
        <NarratorPreview request={previewRequest} label={option.label} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  choice: {
    gap: space.xs,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headName: {
    flex: 1,
  },
  facts: {
    gap: space.xs,
    alignItems: 'flex-start',
  },
});
