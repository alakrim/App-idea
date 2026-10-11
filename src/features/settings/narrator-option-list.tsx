import { StyleSheet, View } from 'react-native';

import { NARRATOR_OPTIONS } from '@/core/narration/options';
import type { NarrationSettings } from '@/core/settings';
import { useApiKeyStatus } from '@/services/secrets';
import { space } from '@/ui/tokens';

import { narrationForOption } from './narration-choices';
import { narratorPrice } from './narrator-copy';
import { NarratorOptionCard } from './narrator-option-card';

import type { CatalogState } from './model-catalog';

export interface NarratorOptionListProps {
  narration: NarrationSettings;
  /** The language the narration is for: the app's target language, or the UI language. */
  lang: string;
  catalog: CatalogState;
  /** Receives the narration settings that picking a narrator makes. */
  onChoose: (narration: NarrationSettings) => void;
}

/** The three narrators, as one radio group. Shared by Settings and onboarding. */
export function NarratorOptionList({
  narration,
  lang,
  catalog,
  onChoose,
}: NarratorOptionListProps) {
  const keyReady = useApiKeyStatus() === 'present';
  const models = catalog.status === 'live' || catalog.status === 'cached' ? catalog.models : [];

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Narrator" style={styles.list}>
      {NARRATOR_OPTIONS.map((option) => {
        const model = models.find((entry) => entry.id === option.modelId) ?? null;
        return (
          <NarratorOptionCard
            key={option.id}
            option={option}
            model={model}
            selected={narration.provider === 'openrouter' && narration.model === option.modelId}
            lang={lang}
            price={narratorPrice(option, catalog)}
            narration={narration}
            keyReady={keyReady}
            onSelect={() =>
              onChoose(narrationForOption(narration, option, lang, model?.supportedVoices ?? []))
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.md,
  },
});
