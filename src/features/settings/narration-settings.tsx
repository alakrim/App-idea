import * as Speech from 'expo-speech';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DEFAULT_NARRATION } from '@/core/defaults';
import { estimateSpeechCost } from '@/core/llm/cost';
import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ErrorState } from '@/ui/error-state';
import { Skeleton } from '@/ui/skeleton';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme } from '@/ui/theme';
import { hairline, minTouchTarget, radius, space } from '@/ui/tokens';

import { formatUsdPrecise, modelLabel } from './format';
import { ModelRow } from './model-row';
import { isModelMissing, useModelCatalog } from './model-catalog';
import { displayName } from './model-search';
import { ModelNotice } from './model-notice';
import { useSettings } from './settings-store';
import { DeviceVoiceCard, VoiceTierCard } from './voice-tier-card';
import { loadDeviceVoices, type DeviceVoice } from './device-voices';
import { previewSampleFor } from './preview-sample';
import { useVoicePreview } from './use-voice-preview';
import {
  buildVoiceTiers,
  narrationForDevice,
  narrationForModel,
  narrationWithVoice,
  narratableModels,
  supportsStyleInstructions,
} from './voice-tiers';

const SPEED_MIN = 0.8;
const SPEED_MAX = 1.2;
const SPEED_STEP = 0.05;
const STYLE_MAX_LENGTH = 200;

/** Narration settings: model tiers with live prices, voices, style, speed and a preview. */
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
  const tiers = useMemo(() => buildVoiceTiers(models, DEFAULT_NARRATION.model), [models]);
  const selectedModel = models.find((model) => model.id === narration.model);
  const missing = !isDevice && isModelMissing(speech.state, narration.model);
  const voices = isDevice
    ? (deviceVoices ?? []).map((voice) => ({ id: voice.identifier, label: voice.name }))
    : (selectedModel?.supportedVoices ?? []).map((voice) => ({ id: voice, label: voice }));
  const styleSupported = !isDevice && supportsStyleInstructions(narration.model);

  const sample = previewSampleFor(settings.defaultTargetLang ?? settings.uiLanguage);
  const estimate = selectedModel ? estimateSpeechCost(selectedModel, sample.text.length) : 0;
  const preview = useVoicePreview(client);

  const [styleDraft, setStyleDraft] = useState(narration.style ?? '');
  useEffect(() => {
    setStyleDraft(narration.style ?? '');
  }, [narration.style]);

  const [speedDraft, setSpeedDraft] = useState(narration.speed);
  useEffect(() => {
    setSpeedDraft(narration.speed);
  }, [narration.speed]);

  const commitStyle = () => {
    const next = styleDraft.trim();
    const style = next === '' ? null : next;
    if (style !== (narration.style ?? null)) {
      patch({ narration: { ...narration, style } });
    }
  };

  const playSample = () => {
    if (isDevice) {
      Speech.stop();
      Speech.speak(sample.text, { voice: narration.voice, language: sample.lang, rate: narration.speed });
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
        Narration turns your text into speech. Prices are live from OpenRouter and show what one hour
        of narration costs.
      </Text>

      {missing ? (
        <ModelNotice
          tone="warning"
          message={`Your voice model, ${modelLabel(narration.model)}, is no longer offered. Pick a replacement.`}
        />
      ) : null}

      <View style={styles.section}>
        <SectionLabel title="Voice model" />
        {speech.state.status === 'loading' ? (
          <Skeleton height={space.xxxl + space.xl} label="Loading voice models" />
        ) : null}
        {speech.state.status === 'unavailable' ? (
          <ErrorState
            title="Voice models are unavailable"
            message={speech.state.message}
            onRetry={speech.reload}
          />
        ) : null}
        {tiers.map((tier) => (
          <VoiceTierCard
            key={tier.id}
            tier={tier}
            selected={!isDevice && tier.model.id === narration.model}
            onSelect={() => patch({ narration: narrationForModel(narration, tier.model) })}
          />
        ))}
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
          title={isDevice ? 'Device voice' : `Voice · ${selectedModel ? displayName(selectedModel) : modelLabel(narration.model)}`}
        />
        {voices.length === 0 ? (
          <Card>
            <Text variant="caption" tone="muted">
              {isDevice
                ? 'This phone has no installed voices to choose from. Install a speech language in the system settings.'
                : 'This model lists no voices right now.'}
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
                  <Text variant="caption" tone={selected ? 'accent' : 'default'}>
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
            value={styleDraft}
            onChangeText={setStyleDraft}
            onBlur={commitStyle}
            onSubmitEditing={commitStyle}
            maxLength={STYLE_MAX_LENGTH}
            returnKeyType="done"
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.row}>
          <SectionLabel title="Speed" />
          <Text variant="caption" tone="accent">
            {`${speedDraft.toFixed(2)}×`}
          </Text>
        </View>
        <Slider
          label="Narration speed"
          value={speedDraft}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          formatValue={(speed) => `${speed.toFixed(2)} times normal speed`}
          minimumLabel="Slower"
          maximumLabel="Faster"
          onValueChange={setSpeedDraft}
          onValueCommit={(speed) => {
            if (speed !== narration.speed) patch({ narration: { ...narration, speed } });
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
                isDevice ? 'Speaks the sample with the device voice' : 'Plays a cached sample, or makes one'
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
