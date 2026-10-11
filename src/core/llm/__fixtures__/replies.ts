import type { LlmReply, LlmUsage } from '../transport';

/** Usage reported by fake transports unless a test overrides it. */
export const FAKE_USAGE: LlmUsage = { promptTokens: 100, completionTokens: 40, costUsd: 0.001 };

/** A reply with the fake usage, for scripted transports. */
export function reply(text: string, usage: Partial<LlmUsage> = {}): LlmReply {
  return { text, usage: { ...FAKE_USAGE, ...usage } };
}
