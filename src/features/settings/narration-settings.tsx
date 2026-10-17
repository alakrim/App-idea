import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { estimateSpeechCost } from '@/core/llm/cost';
import { supportsStyleInstructions } from '@/core/narration/capabilities';
import { voicesForLanguage } from '@/core/narration/voices';
import { usePlayback } from '@/features/player/player-provider';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ErrorState } from '@/ui/error-state';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/theme';
import { hairline, minTouchTarget, radius, space } from '@/ui/tokens';

import { DeviceVoiceCard } from './device-voice-card';
import { loadDeviceVoices, type DeviceVoice } from './device-voices';
import { formatUsdPrecise, modelLabel } from './format';
import { isModelMissing, useModelCatalog } from './model-catalog';
import { ModelNotice } from './model-notice';
import { ModelRow } from './model-row';
import { displayName } from './model-search';
import { narratableModels, narrationForDevice, narrationWithVoice } from './narration-choices';
import { shortLanguageName } from './narrator-copy';
import { NarratorOptionList } from './narrator-option-list';
import { previewSampleFor } from './preview-sample';
import { useSettings } from './settings-store';
import { useVoicePreview } from './use-voice-preview';

const SPEED_MIN = 0.8;
const SPEED_MAX = 1.2;
const SPEED_STEP = 0.05;
const STYLE_MAX_LENGTH = 200;

/** Narration settings: the three narrators, voices, style, speed and a preview. */
export function NarrationPanel() {
  const client = useOpenRouter();
  const { settings, patch } = useSettings();
  const { colors } = useTheme();
  const narration = settings.narration;
  const isDevice = narration.provider === 'device';

  const speech = useModelCatalog(client, 'speech');
  const [deviceVoices, setDeviceVoices] = useState<DeviceVoice[] | null>(null);
  useEffect(() => {
    let active = true;
    void loadDeviceVoices().then((voices) => {
      if (active) setDeviceVoices(voices);
    });
    return () => {
      active = false;
    };
  }, []);

  const models = useMemo(
    () =>
      speech.state.status === 'live' || speech.state.status === 'cached'
        ? narratableModels(speech.state.models)
        : [],
    [speech.state],
  );
  const lang = settings.defaultTargetLang ?? settings.uiLanguage;
  const selectedModel = models.find((model) => model.id === narration.model);
  const missing = !isDevice && isModelMissing(speech.state, narration.model);
  const voices = isDevice
    ? (deviceVoices ?? []).map((voice) => ({ id: voice.identifier, label: voice.name }))
    : voicesForLanguage(narration.model, selectedModel?.supportedVoices ?? [], lang).map(
        (voice) => ({ id: voice, label: voice }),
      );
  const takesNoVoice = !isDevice && selectedModel?.supportedVoices.length === 0;
  const styleSupported =
    !isDevice &&
    supportsStyleInstructions({
      id: narration.model,
      supportedParameters: selectedModel?.supportedParameters,
    });

  const sample = previewSampleFor(lang);
  const estimate = selectedModel ? estimateSpeechCost(selectedModel, sample.text.length) : 0;
  const preview = useVoicePreview(client);
  const playback = usePlayback();

  // Drafts exist only while the user is typing or dragging. They are saved on blur or release.
  const [styleDraft, setStyleDraft] = useState<string | null>(null);
  const [speedDraft, setSpeedDraft] = useState<number | null>(null);
  const styleText = styleDraft ?? narration.style ?? '';
  const speed = speedDraft ?? narration.speed;

  const commitStyle = () => {
    if (styleDraft === null) return;
    const trimmed = styleDraft.trim();
    const style = trimmed === '' ? null : trimmed;
    setStyleDraft(null);
    if (style !== (narration.style ?? null)) {
      patch({ narration: { ...narration, style } });
    }
  };

  const playSample = () => {
    if (isDevice) {
      // The device voice speaks through the playback layer, which holds the narration while it does.
      playback.playSample({
        kind: 'speech',
        text: sample.text,
        language: sample.lang,
        voice: narration.voice,
        rate: narration.speed,
      });
      return;
    }
    if (!selectedModel) return;
    preview.preview({
      model: narration.model,
      voice: narration.voice,
      speed: narration.speed,
      style: narration.style,
      lang: sample.lang,
      text: sample.text,
      estimateUsd: estimate,
    });
  };

  return (
    <>
      <Text variant="body" tone="muted">
        Narration turns your text into speech. Prices are live from OpenRouter and show what one
        hour of narration costs.
      </Text>

      {missing ? (
        <ModelNotice
          tone="warning"
          message={`Your voice model, ${modelLabel(narration.model)}, is no longer offered. Pick a replacement.`}
        />
      ) : null}

      <View style={styles.section}>
        <SectionLabel title="Narrator" />
        {speech.state.status === 'unavailable' ? (
          <ErrorState
            title="Narrator prices are unavailable"
            message={speech.state.message}
            onRetry={speech.reload}
          />
        ) : null}
        <NarratorOptionList
          narration={narration}
          lang={lang}
          catalog={speech.state}
          onChoose={(next) => patch({ narration: next })}
        />
        <DeviceVoiceCard
          selected={isDevice}
          onSelect={() => {
            const first = deviceVoices?.[0];
            if (first) patch({ narration: narrationForDevice(narration, first.identifier) });
          }}
        />
        <ModelRow
          title="All speech models"
          kind="narration"
          modelId={narration.model}
          missing={false}
        />
      </View>

      <View style={styles.section}>
        <SectionLabel
          title={
            isDevice
              ? 'Device voice'
              : `Voice · ${selectedModel ? displayName(selectedModel) : modelLabel(narration.model)}`
          }
        />
        {voices.length === 0 ? (
          <Card>
            <Text variant="caption" tone="muted">
              {emptyVoiceCopy({
                isDevice,
                loading: speech.state.status === 'loading',
                takesNoVoice: takesNoVoice === true,
                lang,
              })}
            </Text>
          </Card>
        ) : (
          <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel="Voices">
            {voices.map((voice) => {
              const selected = voice.id === narration.voice;
              return (
                <Pressable
                  key={voice.id}
                  accessibilityRole="radio"
                  accessibilityLabel={voice.label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    if (selected) return;
                    patch({
                      narration: isDevice
                        ? narrationForDevice(narration, voice.id)
                        : narrationWithVoice(narration, voice.id),
                    });
                  }}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text variant="caption" tone={selected ? 'onAccentSoft' : 'default'}>
                    {voice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {styleSupported ? (
        <View style={styles.section}>
          <SectionLabel title="Style" />
          <TextField
            label="How should it sound?"
            placeholder="Warm audiobook narrator, measured pace"
            helper="Optional. Only some voice models follow style notes."
            value={styleText}
            onChangeText={setStyleDraft}
            onBlur={commitStyle}
            multiline
            lines={3}
            maxLength={STYLE_MAX_LENGTH}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.row}>
          <SectionLabel title="Speed" />
          <Text variant="caption" tone="accent">
            {`${speed.toFixed(2)}×`}
          </Text>
        </View>
        <Slider
          label="Narration speed"
          value={speed}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          formatValue={(speed) => `${speed.toFixed(2)} times normal speed`}
          minimumLabel="Slower"
          maximumLabel="Faster"
          onValueChange={setSpeedDraft}
          onValueCommit={(next) => {
            setSpeedDraft(null);
            if (next !== narration.speed) patch({ narration: { ...narration, speed: next } });
          }}
        />
      </View>

      <View style={styles.section}>
        <SectionLabel title="Preview" />
        <Card>
          <Text variant="reading" style={{ color: colors.text }}>
            {sample.text}
          </Text>
          {preview.phase === 'confirming' && preview.pending ? (
            <View style={styles.confirm}>
              <Text variant="caption" tone="muted">
                {`Previews use your OpenRouter credits, about ${formatUsdPrecise(estimate)} each. You will only see this once.`}
              </Text>
              <Button label="Play sample" onPress={preview.confirm} />
              <Button label="Not now" variant="ghost" onPress={preview.cancelConfirmation} />
            </View>
          ) : (
            <Button
              label={preview.phase === 'loading' ? 'Making the sample' : 'Play sample'}
              variant="secondary"
              loading={preview.phase === 'loading'}
              disabled={!isDevice && !selectedModel}
              onPress={playSample}
              accessibilityHint={
                isDevice
                  ? 'Speaks the sample with the device voice'
                  : 'Plays a cached sample, or makes one'
              }
            />
          )}
          {preview.phase === 'error' && preview.message ? (
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
              {preview.message}
            </Text>
          ) : null}
          {preview.isPlaying ? (
            <Text variant="caption" tone="accent" accessibilityLiveRegion="polite">
              Playing the sample…
            </Text>
          ) : null}
        </Card>
      </View>
    </>
  );
}

interface EmptyVoiceState {
  isDevice: boolean;
  loading: boolean;
  takesNoVoice: boolean;
  lang: string;
}

/** Why the voice list is empty. Each case says what the user can do about it. */
function emptyVoiceCopy({ isDevice, loading, takesNoVoice, lang }: EmptyVoiceState): string {
  if (isDevice) {
    return 'This phone has no installed voices to choose from. Install a speech language in the system settings.';
  }
  if (loading) return 'Loading the voices…';
  if (takesNoVoice) return 'This narrator picks its own voice, so there is nothing to choose.';
  return `This model has no voice for ${shortLanguageName(lang)}. Pick another narrator, or change the target language.`;
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text variant="micro" tone="faint" accessibilityRole="header">
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  pill: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  confirm: {
    gap: space.sm,
  },
});
