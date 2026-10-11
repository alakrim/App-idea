export type JsonParseResult = { ok: true; value: unknown } | { ok: false };

const FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

/**
 * Parses JSON from a model reply that may carry a ``` fence or prose around the object.
 * It tries the whole reply, then the fenced body, then the span from the first `{`/`[` to
 * the last `}`/`]`.
 */
export function parseTolerantJson(raw: string): JsonParseResult {
  for (const candidate of jsonCandidates(raw)) {
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
  const candidates = [trimmed];

  const fenced = FENCE_PATTERN.exec(trimmed)?.[1]?.trim();
  if (fenced) candidates.push(fenced);

  const start = trimmed.search(/[{[]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  return candidates;
}
