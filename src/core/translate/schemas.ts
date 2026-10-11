import { z } from 'zod';

import { parseJsonReply } from '../llm/json';

import type { TranslatedItem } from './types';
import type { JsonSchemaSpec } from '../llm/transport';

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

/** The json_schema the translation call sends, derived from the reply schema. */
export const TRANSLATE_JSON_SCHEMA: JsonSchemaSpec = {
  name: 'chapter_translation',
  schema: z.toJSONSchema(translateResponseSchema, { io: 'output', reused: 'inline' }),
};

export type TranslateReplyOutcome =
  | { readonly ok: true; readonly items: TranslatedItem[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Parses and validates one reply. Pure, so it is easy to test. It does not check which idx values
 * came back, since that is `validateAlignment`'s job. The reply text is never echoed in a reason.
 */
export function parseTranslateReply(text: string): TranslateReplyOutcome {
  const json = parseJsonReply(text);
  if (!json.ok) return { ok: false, reason: 'reply is not valid JSON' };
  const parsed = translateResponseSchema.safeParse(json.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.map(String).join('.') || 'root';
    return { ok: false, reason: `${where}: ${issue?.message ?? 'invalid shape'}` };
  }
  return { ok: true, items: parsed.data.items };
}
