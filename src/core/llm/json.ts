/*
 * Shared helpers for model replies. Every LLM output is parsed here and then validated with zod, so
 * the analysis, translation, selection and OpenRouter client paths all parse the same way.
 */

const FENCED_BODY = /^```(?:json)?\s*([\s\S]*?)\s*```$/u;
const FENCE_ANYWHERE = /```(?:json)?\s*([\s\S]*?)```/iu;

/** Removes one Markdown code fence that wraps the whole reply. Other text is returned trimmed. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  return FENCED_BODY.exec(trimmed)?.[1] ?? trimmed;
}

export type JsonReply = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function firstParsable(candidates: readonly string[]): JsonReply {
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false };
}

/**
 * Parses a reply that is the JSON itself, optionally wrapped in one code fence. Prose around the
 * JSON is rejected, so a selection or a translation is never taken from a half-formed reply.
 * Invalid JSON is reported, never thrown, and the reply is never echoed.
 */
export function parseJsonReply(text: string): JsonReply {
  return firstParsable([stripCodeFence(text)]);
}

/**
 * Like `parseJsonReply`, but also accepts a fenced body or a span from the first `{` or `[` to the
 * last `}` or `]` when the model wrapped its JSON in prose. Used where a reply may carry chatter,
 * such as the OpenRouter client's JSON-only fallback.
 */
export function parseTolerantJson(text: string): JsonReply {
  const trimmed = text.trim();
  const candidates = [stripCodeFence(trimmed)];

  const fenced = FENCE_ANYWHERE.exec(trimmed)?.[1]?.trim();
  if (fenced) candidates.push(fenced);

  const start = trimmed.search(/[{[]/u);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  return firstParsable(candidates);
}
