/*
 * Pure cost math. It moved here from services/openrouter/cost.ts so that the pipeline can estimate
 * and record cost without importing services. Speech cost assumptions come from R1
 * (docs/research/R1-openrouter.md, section 1f):
 * - Token-priced speech models bill 25 audio tokens per second of narration (Google's figure).
 * - Narration length in seconds comes from text/speech-rate, which rates each script separately.
 *   Callers that know the seconds (measured audio, or a script-aware estimate) pass them in.
 * - Text input to a token-priced speech model is about 4 characters per token.
 * A character-priced model bills `prompt` per input character.
 */

import { estimateSpeechSecondsForChars } from '../text/speech-rate';

/** USD per unit of the model's billing unit (per token, or per character for character-priced TTS). */
export interface ModelPricing {
  readonly prompt: number;
  readonly completion: number;
}

export interface PricedModel {
  readonly pricing: ModelPricing;
}

export const SPEECH_AUDIO_TOKENS_PER_SECOND = 25;
export const TEXT_CHARS_PER_TOKEN = 4;

export function estimateChatCost(
  model: PricedModel,
  promptTokens: number,
  completionTokens: number,
): number {
  return promptTokens * model.pricing.prompt + completionTokens * model.pricing.completion;
}

/**
 * Speech models priced per token bill their audio as `completion`. Models priced per character
 * bill the input as `prompt` and have no completion price. This rule is a heuristic. A model with
 * a per-second price (for example Seed Audio) would be misestimated.
 *
 * `seconds` is the narration length. Pass it whenever it is known (measured audio, or the
 * script-aware estimate). When it is omitted, the length is estimated from `chars` at the Latin rate.
 */
export function estimateSpeechCost(
  model: PricedModel,
  chars: number,
  seconds: number = estimateSpeechSecondsForChars(chars),
): number {
  const { prompt, completion } = model.pricing;
  if (completion > 0) {
    const audioTokens = seconds * SPEECH_AUDIO_TOKENS_PER_SECOND;
    const textTokens = chars / TEXT_CHARS_PER_TOKEN;
    return audioTokens * completion + textTokens * prompt;
  }
  return chars * prompt;
}

/** Short money text for the UI: "< $0.01", "$0.55", "$2.16", "$12.3", "$1235". */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount))
    throw new RangeError(`formatUsd expects a finite number, got ${amount}`);
  if (amount <= 0) return '$0.00';
  if (amount < 0.01) return '< $0.01';
  if (amount >= 1000) return `$${Math.round(amount)}`;
  return `$${amount.toPrecision(amount < 1 ? 2 : 3)}`;
}
