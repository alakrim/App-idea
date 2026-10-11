import { ScrollView, StyleSheet, View } from 'react-native';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { useModelCatalog } from '@/features/settings/model-catalog';
import { NarratorOptionList } from '@/features/settings/narrator-option-list';
import { useSettings } from '@/features/settings/settings-store';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

export interface NarratorStepProps {
  /** Called when the user moves on. The choice is already saved by then. */
  onDone: () => void;
}

/**
 * Onboarding step 3: choose the narrator. Best quality is the default, every choice saves at once,
 * and Settings can change it later.
 */
export function NarratorStep({ onDone }: NarratorStepProps) {
  const client = useOpenRouter();
  const { settings, patch } = useSettings();
  const speech = useModelCatalog(client, 'speech');
  const lang = settings.defaultTargetLang ?? settings.uiLanguage;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.copy}>
        <Text variant="title" accessibilityRole="header">
          Choose your narrator
        </Text>
        <Text variant="body" tone="muted">
          Pick the voice that reads your chapters. Best quality is our default. You can change it
          any time in Settings.
        </Text>
      </View>

      <NarratorOptionList
        narration={settings.narration}
        lang={lang}
        catalog={speech.state}
        onChoose={(narration) => patch({ narration })}
      />

      <View style={styles.footer}>
        <Button label="Continue" size="lg" fullWidth onPress={onDone} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  copy: {
    gap: space.sm,
  },
  footer: {
    marginTop: space.sm,
  },
});
