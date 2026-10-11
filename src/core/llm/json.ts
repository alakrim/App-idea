/** Shared helpers for model replies. Every LLM output is parsed here and then validated with zod. */

const FENCED_BODY = /^```(?:json)?\s*([\s\S]*?)\s*```$/u;

/** Removes one Markdown code fence that wraps the whole reply. Other text is returned trimmed. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  return FENCED_BODY.exec(trimmed)?.[1] ?? trimmed;
}

export type JsonReply = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** Parses a reply that may be wrapped in a code fence. Invalid JSON is reported, never thrown. */
export function parseJsonReply(text: string): JsonReply {
  try {
    return { ok: true, value: JSON.parse(stripCodeFence(text)) };
  } catch {
    return { ok: false };
  }
}
