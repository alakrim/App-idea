import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { createIdGenerator } from '@/core/domain';
import { findLanguage, languagePairLabel } from '@/features/shared/languages';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ListItem } from '@/ui/list-item';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { gutter, space } from '@/ui/tokens';

import { importCover } from './cover-import';
import { CoverPicker } from './cover-picker';
import { LanguageSheet } from './language-sheet';
import { validateSeriesName, type SeriesFormValues } from './series-service';

type LanguageField = 'sourceLang' | 'targetLang';

export interface SeriesFormProps {
  initial: SeriesFormValues;
  submitLabel: string;
  onSubmit: (values: SeriesFormValues) => void;
  /** Shown on the submit button while the parent saves. */
  saving?: boolean;
}

/** Name, cover and languages for a new or existing series. Submit stays off until the name is valid. */
export function SeriesForm({ initial, submitLabel, onSubmit, saving = false }: SeriesFormProps) {
  const [values, setValues] = useState<SeriesFormValues>(initial);
  const [nameTouched, setNameTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [languageFor, setLanguageFor] = useState<LanguageField | null>(null);
  const newId = useMemo(() => createIdGenerator(), []);

  const nameProblem = validateSeriesName(values.title);
  const canSubmit = nameProblem === null && !saving && !picking;

  const pickCover = async () => {
    setCoverError(null);
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [2, 3],
        quality: 0.9,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset) {
        const cover = await importCover(asset.uri, newId);
        setValues((current) => ({ ...current, coverUri: cover.uri, coverTint: cover.tint }));
      }
    } catch {
      setCoverError("We couldn't use that picture. Try another one.");
    } finally {
      setPicking(false);
    }
  };

  const languageLabel = (code: string | null) => {
    const language = findLanguage(code);
    return language ? `${language.nativeName} · ${language.name}` : 'Not set';
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cover}>
          <CoverPicker
            title={values.title}
            coverUri={values.coverUri}
            busy={picking}
            onPress={() => void pickCover()}
          />
          {coverError ? (
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite" align="center">
              {coverError}
            </Text>
          ) : null}
        </View>

        <TextField
          label="Series name"
          helper="You can change this later."
          value={values.title}
          onChangeText={(title) => setValues((current) => ({ ...current, title }))}
          onBlur={() => setNameTouched(true)}
          error={nameTouched ? (nameProblem ?? undefined) : undefined}
          returnKeyType="done"
          maxLength={80}
          autoCapitalize="words"
          placeholder="The Night Harbour"
        />

        <View style={styles.section}>
          <Text variant="micro" tone="muted">
            Languages
          </Text>
          <Card style={styles.flush}>
            <ListItem
              title="Original language"
              subtitle={languageLabel(values.sourceLang)}
              onPress={() => setLanguageFor('sourceLang')}
              accessibilityHint="Chooses the language the chapters are written in"
            />
            <ListItem
              title="Translate into"
              subtitle={languageLabel(values.targetLang)}
              onPress={() => setLanguageFor('targetLang')}
              accessibilityHint="Chooses the language for translated listening, if any"
            />
          </Card>
          {languagePairLabel(values.sourceLang, values.targetLang) ? (
            <Text variant="caption" tone="muted">
              {`Listeners see ${languagePairLabel(values.sourceLang, values.targetLang)}.`}
            </Text>
          ) : null}
        </View>

        <Button
          label={submitLabel}
          size="lg"
          fullWidth
          disabled={!canSubmit}
          loading={saving}
          onPress={() => onSubmit({ ...values, title: values.title.trim() })}
        />
      </ScrollView>

      <LanguageSheet
        visible={languageFor !== null}
        title={languageFor === 'targetLang' ? 'Translate into' : 'Original language'}
        value={languageFor === null ? null : values[languageFor]}
        onSelect={(code) => {
          if (languageFor) setValues((current) => ({ ...current, [languageFor]: code }));
        }}
        onClose={() => setLanguageFor(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.xl,
  },
  cover: {
    alignItems: 'center',
    gap: space.sm,
  },
  section: {
    gap: space.sm,
  },
  flush: {
    padding: 0,
  },
});
