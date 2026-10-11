import { z } from 'zod';

import { AMBIENCE_CATEGORY_IDS } from './ambience-taxonomy';
import { MEMORY_LIMITS } from './limits';
import { normalizeName } from '../memory/entities';
import { normalizeWhitespace } from '../text/normalize';

import type { IntensityLevel, MemoryFields } from './types';

export const INTENSITY_LEVELS = [
  'low',
  'medium',
  'high',
] as const satisfies readonly IntensityLevel[];

const namedFactsSchema = z.object({
  name: z.string(),
  facts: z.array(z.string()).default([]),
});

const characterSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  role: z.string().optional(),
  facts: z.array(z.string()).default([]),
});

/** What the model returns for `memory`. Lengths are not rejected here; `normalizeMemory` truncates. */
export const memoryDraftSchema = z.object({
  summary: z.string(),
  keyEvents: z.array(z.string()).default([]),
  characters: z.array(characterSchema).default([]),
  places: z.array(namedFactsSchema).default([]),
  items: z.array(namedFactsSchema).default([]),
  relationships: z
    .array(z.object({ a: z.string(), b: z.string(), nature: z.string() }))
    .default([]),
  openThreads: z.array(z.string()).default([]),
  glossary: z
    .array(
      z.object({
        term: z.string(),
        translation: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

/**
 * One cue as the model returns it. Fades are not requested from the model. The validator checks
 * the category and ranges, so this schema accepts any string for the category.
 */
export const rawCueSchema = z.object({
  category: z.string().trim().min(1),
  startSentence: z.number(),
  endSentence: z.number(),
  intensity: z.enum(INTENSITY_LEVELS).optional(),
  confidence: z.number(),
  reason: z.string().optional(),
});

/** Every known category id, as a zod enum. Stored ids are never renamed (ADR-0005). */
export const ambienceCategoryIdSchema = z.enum(AMBIENCE_CATEGORY_IDS);

/** The whole analysis reply. Cues stay `unknown` so that one bad cue cannot drop the memory. */
export const analysisResponseSchema = z.object({
  memory: memoryDraftSchema,
  cues: z.array(z.unknown()).default([]),
});

export type MemoryDraft = z.infer<typeof memoryDraftSchema>;

/**
 * Truncates to at most `maxWords` words, keeping the original spacing. CJK ideographs and kana
 * count as one word each, since that script has no spaces between words.
 */
const WORD_TOKEN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function truncateWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  let count = 0;
  for (const match of trimmed.matchAll(WORD_TOKEN)) {
    count += 1;
    if (count > maxWords) return trimmed.slice(0, match.index ?? 0).trimEnd();
  }
  return trimmed;
}

/** Trims, drops blanks and duplicates (by normalized form), then keeps the first `max`. */
function cleanList(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeWhitespace(raw);
    const key = normalizeName(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length === max) break;
  }
  return out;
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value === undefined ? '' : normalizeWhitespace(value);
  return cleaned || undefined;
}

/**
 * Enforces the memory size caps by truncation, never by rejection, and tidies whitespace. Names are
 * kept exactly as written (only whitespace is collapsed).
 */
export function normalizeMemory(draft: MemoryDraft): MemoryFields {
  const named = <T extends { name: string }>(entries: readonly T[], max: number): T[] =>
    entries
      .map((entry) => ({ ...entry, name: normalizeWhitespace(entry.name) }))
      .filter((entry) => entry.name !== '')
      .slice(0, max);

  return {
    summary: truncateWords(normalizeWhitespace(draft.summary), MEMORY_LIMITS.summaryWords),
    keyEvents: cleanList(draft.keyEvents, MEMORY_LIMITS.keyEvents).map((e) =>
      truncateWords(e, MEMORY_LIMITS.keyEventWords),
    ),
    characters: named(draft.characters, MEMORY_LIMITS.characters).map((c) => {
      const role = cleanOptional(c.role);
      return {
        name: c.name,
        aliases: cleanList(c.aliases, Infinity).filter(
          (alias) => normalizeName(alias) !== normalizeName(c.name),
        ),
        ...(role ? { role } : {}),
        facts: cleanList(c.facts, MEMORY_LIMITS.facts),
      };
    }),
    places: named(draft.places, MEMORY_LIMITS.places).map((p) => ({
      name: p.name,
      facts: cleanList(p.facts, MEMORY_LIMITS.facts),
    })),
    items: named(draft.items, MEMORY_LIMITS.items).map((i) => ({
      name: i.name,
      facts: cleanList(i.facts, MEMORY_LIMITS.facts),
    })),
    relationships: draft.relationships
      .map((r) => ({
        a: normalizeWhitespace(r.a),
        b: normalizeWhitespace(r.b),
        nature: normalizeWhitespace(r.nature),
      }))
      .filter((r) => r.a && r.b && r.nature)
      .slice(0, MEMORY_LIMITS.relationships),
    openThreads: cleanList(draft.openThreads, MEMORY_LIMITS.openThreads),
    glossary: draft.glossary
      .map((g) => {
        const translation = cleanOptional(g.translation);
        const note = cleanOptional(g.note);
        return {
          term: normalizeWhitespace(g.term),
          ...(translation ? { translation } : {}),
          ...(note ? { note } : {}),
        };
      })
      .filter((g) => g.term)
      .slice(0, MEMORY_LIMITS.glossary),
  };
}
