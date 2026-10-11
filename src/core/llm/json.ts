/*
 * Shared helpers for model replies. Every LLM output is parsed here and then validated with zod.
 * One parser serves the analysis, translation, selection and OpenRouter client paths, so a reply
 * that one of them accepts is accepted by all of them.
 */

const FENCED_BODY = /^```(?:json)?\s*([\s\S]*?)\s*```$/u;
const FENCE_ANYWHERE = /```(?:json)?\s*([\s\S]*?)```/iu;

/** Removes one Markdown code fence that wraps the whole reply. Other text is returned trimmed. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  return FENCED_BODY.exec(trimmed)?.[1] ?? trimmed;
}

export type JsonReply = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/**
 * Parses JSON from a model reply that may carry a code fence or prose around the object. It tries
 * the whole reply, then the first fenced body, then the span from the first `{` or `[` to the last
 * `}` or `]`. Invalid JSON is reported, never thrown, and the reply is never echoed.
 */
export function parseJsonReply(text: string): JsonReply {
  for (const candidate of jsonCandidates(text)) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false };
}

function jsonCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const candidates = [stripCodeFence(trimmed)];

  const fenced = FENCE_ANYWHERE.exec(trimmed)?.[1]?.trim();
  if (fenced) candidates.push(fenced);

  const start = trimmed.search(/[{[]/u);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  return candidates;
}
