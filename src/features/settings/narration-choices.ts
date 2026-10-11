import { DEFAULT_NARRATION } from '@/core/defaults';
import { estimateSpeechCost } from '@/core/llm/cost';
import { optionFor, type NarratorOption } from '@/core/narration/options';
import { defaultVoiceFor } from '@/core/narration/voices';
import type { NarrationSettings } from '@/core/settings';
import type { OpenRouterModel } from '@/services/openrouter';

import type { PreviewSample } from './preview-sample';
import type { PreviewRequest } from './use-voice-preview';

/*
 * How narration settings change when the user picks a voice model, a narrator or a voice. Prices
 * come from the live catalogue every time, never from a table. Pure, so each rule is testable.
 */

/** Characters in one hour of narration (about 15 characters a second). */
export const NARRATION_CHARS_PER_HOUR = 54_000;

export function hourlyNarrationCost(model: Pick<OpenRouterModel, 'pricing'>): number {
  return estimateSpeechCost(model, NARRATION_CHARS_PER_HOUR);
}

/**
 * Speech models the user can narrate with: those that list at least one voice, plus the narrators
 * that take no voice at all.
 */
export function narratableModels(models: readonly OpenRouterModel[]): OpenRouterModel[] {
  return models.filter((model) => model.supportedVoices.length > 0 || optionFor(model.id) !== null);
}

/** Only some providers accept the `instructions` steering field. R1 documents Gemini TTS and gpt-4o-mini-tts. */
export function supportsStyleInstructions(modelId: string): boolean {
  return /^google\/gemini-.*tts/.test(modelId) || /gpt-4o-mini-tts/.test(modelId);
}

/**
 * The narration settings after switching to `model`. The voice is kept when the new model has it.
 * Otherwise the first voice that speaks `lang` is used, when a language is given. A model with no
 * voices gets the empty voice. Style is kept only where the model accepts it.
 */
export function narrationForModel(
  current: NarrationSettings,
  model: Pick<OpenRouterModel, 'id' | 'supportedVoices'>,
  lang: string | null = null,
): NarrationSettings {
  const voice = model.supportedVoices.includes(current.voice)
    ? current.voice
    : ((lang === null ? null : defaultVoiceFor(model.id, model.supportedVoices, lang)) ??
      model.supportedVoices[0] ??
      '');
  return {
    ...current,
    provider: 'openrouter',
    model: model.id,
    voice,
    style: supportsStyleInstructions(model.id) ? (current.style ?? DEFAULT_NARRATION.style) : null,
  };
}

/** Settings after choosing one of the three narrators. Speed is kept. */
export function narrationForOption(
  current: NarrationSettings,
  option: NarratorOption,
  lang: string,
  voices: readonly string[],
): NarrationSettings {
  return {
    ...current,
    provider: 'openrouter',
    model: option.modelId,
    voice: option.defaultVoice(lang, voices) ?? '',
    style: option.supportsStyle ? (current.style ?? DEFAULT_NARRATION.style) : null,
  };
}

export interface NarratorPreviewInput {
  narration: NarrationSettings;
  /** The language the narrator picks its voice for. */
  lang: string;
  voices: readonly string[];
  sample: PreviewSample;
  /** The estimated OpenRouter cost of one synthesis of the sample, in USD. */
  estimateUsd: number;
}

/** The sample request for one narrator, with its own voice and the current speed and style. */
export function narratorPreviewRequest(
  option: NarratorOption,
  input: NarratorPreviewInput,
): PreviewRequest {
  return {
    model: option.modelId,
    voice: option.defaultVoice(input.lang, input.voices) ?? '',
    speed: input.narration.speed,
    style: option.supportsStyle ? (input.narration.style ?? DEFAULT_NARRATION.style) : null,
    lang: input.sample.lang,
    text: input.sample.text,
    estimateUsd: input.estimateUsd,
  };
}

/** Settings after choosing a voice name. Keeps the rest of the narration profile. */
export function narrationWithVoice(current: NarrationSettings, voice: string): NarrationSettings {
  return { ...current, provider: 'openrouter', voice };
}

/** Settings after choosing the on-device voice. The provider switches and the model is cleared. */
export function narrationForDevice(current: NarrationSettings, voice: string): NarrationSettings {
  return { ...current, provider: 'device', voice };
}
