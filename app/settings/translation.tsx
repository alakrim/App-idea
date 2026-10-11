import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { isModelMissing, useModelCatalog } from '@/features/settings/model-catalog';
import { modelKindConfig } from '@/features/settings/model-kinds';
import { ModelRow } from '@/features/settings/model-row';
import { SettingsPage } from '@/features/settings/settings-page';
import { SettingsSection } from '@/features/settings/settings-section';
import { useSettings } from '@/features/settings/settings-store';
import { filterLanguages, LANGUAGES, type LanguageOption } from '@/features/shared/languages';
import { Check } from '@/ui/icons';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/theme';
import { iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

/** `null` is the "Off" row. */
type LanguageChoice = LanguageOption | null;

/** Translation settings: the model that translates, and the default target language. */
export default function TranslationScreen() {
  const client = useOpenRouter();
  const { settings, patch } = useSettings();
  const catalog = useModelCatalog(client, 'text');
  const config = modelKindConfig('translation', settings);
  const [query, setQuery] = useState('');
  const choices = useMemo<LanguageChoice[]>(
    () => [null, ...filterLanguages(LANGUAGES, query)],
    [query],
  );

  const renderItem: ListRenderItem<LanguageChoice> = ({ item }) => (
    <LanguageRow
      choice={item}
      selected={
        item?.code === settings.defaultTargetLang ||
        (item === null && settings.defaultTargetLang === null)
      }
      onSelect={() => patch({ defaultTargetLang: item?.code ?? null })}
    />
  );

  return (
    <SettingsPage title="Translation" scrollable={false}>
      <FlatList
        data={choices}
        keyExtractor={(item) => item?.code ?? 'off'}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <SettingsSection title="Model">
              <ModelRow
                title="Translation model"
                kind="translation"
                modelId={settings.translationModel}
                missing={isModelMissing(catalog.state, config.selectedId)}
              />
            </SettingsSection>

            <View style={styles.languageHeading}>
              <Text variant="micro" tone="faint" accessibilityRole="header">
                Default target language
              </Text>
              <Text variant="caption" tone="muted">
                New chapters are translated into this language. Choose Off to skip translation.
              </Text>
            </View>
            <TextField
              label="Search languages"
              placeholder="Name or code"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
        }
      />
    </SettingsPage>
  );
}

function LanguageRow({
  choice,
  selected,
  onSelect,
}: {
  choice: LanguageChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const title = choice?.nativeName ?? 'Off';
  const detail = choice ? choice.name : 'No translation';

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={
        choice ? `${choice.nativeName}, ${choice.name}` : 'Off, no translation'
      }
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceRaised } : null,
      ]}
    >
      <View style={styles.copy}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      </View>
      {selected ? (
        <Check size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: space.xxl,
    gap: space.xxs,
  },
  header: {
    gap: space.lg,
    paddingBottom: space.sm,
  },
  languageHeading: {
    gap: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget + space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
});
