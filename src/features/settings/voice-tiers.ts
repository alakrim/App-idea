import { DEFAULT_NARRATION } from '@/core/defaults';
import { estimateSpeechCost } from '@/core/llm/cost';
import type { NarrationSettings } from '@/core/settings';
import type { OpenRouterModel } from '@/services/openrouter';

/**
 * Narration pricing and tiers. Prices come from the live catalog every time, never from a
 * hard-coded table. ADR-0003 fixes the tier names and the 54k-character hour.
 */

/** Characters in one hour of narration (about 15 characters a second). */
export const NARRATION_CHARS_PER_HOUR = 54_000;

/** Hourly prices below this are Budget. */
export const BUDGET_MAX_USD_PER_HOUR = 0.15;
/** Hourly prices at or above this are Premium. Everything between is Recommended. */
export const PREMIUM_MIN_USD_PER_HOUR = 1.5;

export type VoiceTierId = 'budget' | 'recommended' | 'premium';

export interface VoiceTier {
  id: VoiceTierId;
  model: OpenRouterModel;
  usdPerHour: number;
}

export function hourlyNarrationCost(model: Pick<OpenRouterModel, 'pricing'>): number {
  return estimateSpeechCost(model, NARRATION_CHARS_PER_HOUR);
}

export function tierForHourlyCost(usdPerHour: number): VoiceTierId {
  if (usdPerHour < BUDGET_MAX_USD_PER_HOUR) return 'budget';
  if (usdPerHour >= PREMIUM_MIN_USD_PER_HOUR) return 'premium';
  return 'recommended';
}

/** Speech models that can actually narrate: they must list at least one voice. */
export function narratableModels(models: readonly OpenRouterModel[]): OpenRouterModel[] {
  return models.filter((model) => model.supportedVoices.length > 0);
}

function cheapestFirst(a: VoiceTier, b: VoiceTier): number {
  return a.usdPerHour - b.usdPerHour || a.model.id.localeCompare(b.model.id);
}

/**
 * One model per tier, picked from the live catalog:
 * - Recommended: the default narration model when it is available, otherwise the cheapest
 *   Recommended-band model.
 * - Budget: the cheapest model in the Budget band.
 * - Premium: the cheapest model in the Premium band.
 * A tier with no candidate is left out instead of guessing.
 */
export function buildVoiceTiers(
  models: readonly OpenRouterModel[],
  recommendedId: string = DEFAULT_NARRATION.model,
): VoiceTier[] {
  const priced = narratableModels(models).map((model) => ({
    id: tierForHourlyCost(hourlyNarrationCost(model)),
    model,
    usdPerHour: hourlyNarrationCost(model),
  }));

  const tiers: VoiceTier[] = [];
  const budget = priced.filter((entry) => entry.id === 'budget').sort(cheapestFirst)[0];
  if (budget) tiers.push({ id: 'budget', model: budget.model, usdPerHour: budget.usdPerHour });

  const preferred = priced.find((entry) => entry.model.id === recommendedId);
  const middle = priced.filter((entry) => entry.id === 'recommended').sort(cheapestFirst)[0];
  const recommended = preferred ?? middle;
  if (recommended) {
    tiers.push({
      id: 'recommended',
      model: recommended.model,
      usdPerHour: recommended.usdPerHour,
    });
  }

  const premium = priced.filter((entry) => entry.id === 'premium').sort(cheapestFirst)[0];
  if (premium) tiers.push({ id: 'premium', model: premium.model, usdPerHour: premium.usdPerHour });

  return tiers;
}

/** Only some providers accept the `instructions` steering field. R1 documents Gemini TTS and gpt-4o-mini-tts. */
export function supportsStyleInstructions(modelId: string): boolean {
  return /^google\/gemini-.*tts/.test(modelId) || /gpt-4o-mini-tts/.test(modelId);
}

/**
 * The narration settings after switching to `model`. The voice is kept when the new model has it,
 * otherwise the model's first voice is used. Style is kept only where the model accepts it.
 */
export function narrationForModel(
  current: NarrationSettings,
  model: Pick<OpenRouterModel, 'id' | 'supportedVoices'>,
): NarrationSettings {
  const voice = model.supportedVoices.includes(current.voice)
    ? current.voice
    : (model.supportedVoices[0] ?? current.voice);
  return {
    ...current,
    provider: 'openrouter',
    model: model.id,
    voice,
    style: supportsStyleInstructions(model.id) ? (current.style ?? DEFAULT_NARRATION.style) : null,
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
