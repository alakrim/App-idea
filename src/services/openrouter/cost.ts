import type { ModelPricing } from './models';

/*
 * Speech cost assumptions, from R1 (docs/research/R1-openrouter.md, section 1f):
 * - Token-priced speech models bill 25 audio tokens per second of narration (Google's figure).
 * - Narration runs at about 15 characters per second (about 150 words per minute).
 * - Text input to a token-priced speech model is about 4 characters per token.
 * A character-priced model bills `prompt` per input character.
 */
export const SPEECH_AUDIO_TOKENS_PER_SECOND = 25;
export const SPEECH_CHARS_PER_SECOND = 15;
export const TEXT_CHARS_PER_TOKEN = 4;

export function estimateChatCost(
  model: { pricing: ModelPricing },
  promptTokens: number,
  completionTokens: number,
): number {
  return promptTokens * model.pricing.prompt + completionTokens * model.pricing.completion;
}

/**
 * Speech models priced per token bill their audio as `completion`. Models priced per character
 * bill the input as `prompt` and have no completion price. This rule is a heuristic. A model with
 * a per-second price (for example Seed Audio) would be misestimated.
 */
export function estimateSpeechCost(model: { pricing: ModelPricing }, chars: number): number {
  const { prompt, completion } = model.pricing;
  if (completion > 0) {
    const audioTokens = (chars / SPEECH_CHARS_PER_SECOND) * SPEECH_AUDIO_TOKENS_PER_SECOND;
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
