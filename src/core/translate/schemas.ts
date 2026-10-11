import { z } from 'zod';

import type { TranslatedItem } from './types';

/**
 * The model's reply. Strict json_schema mode: every key is required and there are no optional
 * keys, so the schema needs no null handling.
 */
export const translatedItemSchema = z.object({
  idx: z.number().int(),
  text: z.string(),
});

export const translateResponseSchema = z.object({
  items: z.array(translatedItemSchema),
});

export type TranslateReplyOutcome =
  | { readonly ok: true; readonly items: TranslatedItem[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Parses and validates one reply. Pure, so it is easy to test. It does not check which idx values
 * came back, since that is `validateAlignment`'s job. The reply text is never echoed in a reason.
 */
export function parseTranslateReply(text: string): TranslateReplyOutcome {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(text.trim()));
  } catch {
    return { ok: false, reason: 'reply is not valid JSON' };
  }
  const parsed = translateResponseSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.map(String).join('.') || 'root';
    return { ok: false, reason: `${where}: ${issue?.message ?? 'invalid shape'}` };
  }
  return { ok: true, items: parsed.data.items };
}

function stripCodeFence(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(text);
  return match?.[1] ?? text;
}
