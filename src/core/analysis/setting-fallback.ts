/*
 * The single-bed fallback (ADR-0005 amendment 2026-10-17). A chapter of at least 200 words that ends
 * analysis with no valid cue gets one extra call. It names at most one bed for the chapter's dominant
 * setting, and that bed spans the whole chapter. The caller validates it with the same rules.
 */
import { ANALYSIS_SAMPLING, CUE_LIMITS } from './limits';
import { buildSettingFallbackPrompt } from './prompts';
import { SETTING_FALLBACK_JSON_SCHEMA, settingFallbackOutputSchema } from './schemas';
import { parseJsonReply } from '../llm/json';

import type { MemoryFields } from './types';
import type { LlmTransport, LlmUsage } from '../llm/transport';

/** True when the fallback applies: no cue survived, and the chapter is long enough to have a setting. */
export function needsSettingFallback(
  cueCount: number,
  wordCount: number,
  sentenceCount: number,
): boolean {
  return cueCount === 0 && wordCount >= CUE_LIMITS.minWordsForCues && sentenceCount > 0;
}

/**
 * The reply as one raw cue spanning the whole chapter, ready for validateCues. Null when the model
 * names no setting, or when its reply does not match the schema. A bad fallback reply is not an
 * error: the chapter simply keeps no cues.
 */
export function parseSettingFallback(
  text: string,
  sentenceCount: number,
): Record<string, unknown> | null {
  const json = parseJsonReply(text);
  if (!json.ok) return null;
  const parsed = settingFallbackOutputSchema.safeParse(json.value);
  if (!parsed.success || parsed.data.cue === null) return null;
  const { cue } = parsed.data;
  return {
    category: cue.category,
    startSentence: 0,
    endSentence: sentenceCount - 1,
    intensity: cue.intensity,
    confidence: cue.confidence,
    reason: cue.reason,
  };
}

export interface SettingFallbackInput {
  readonly chapterTitle: string;
  readonly memory: MemoryFields;
  readonly sentenceCount: number;
}

export interface SettingFallbackResult {
  /** The bed as a raw cue for the whole chapter, or null when no bed fits. */
  readonly rawCue: Record<string, unknown> | null;
  readonly usage: LlmUsage;
}

/** One call, never repeated. Transport errors propagate to the caller. */
export async function runSettingFallback(
  callLlm: LlmTransport,
  input: SettingFallbackInput,
  signal?: AbortSignal,
): Promise<SettingFallbackResult> {
  const prompt = buildSettingFallbackPrompt({
    chapterTitle: input.chapterTitle,
    memory: input.memory,
  });
  const reply = await callLlm({
    system: prompt.system,
    user: prompt.user,
    jsonSchema: SETTING_FALLBACK_JSON_SCHEMA,
    signal,
    cacheSystem: true,
    ...ANALYSIS_SAMPLING,
  });
  return {
    rawCue: parseSettingFallback(reply.text, input.sentenceCount),
    usage: reply.usage,
  };
}
