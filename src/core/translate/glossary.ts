import { aliasesThrough } from '../memory/aliases';
import { normalizeName } from '../memory/entities';
import { estimateTokens } from '../text/chunk';
import { normalizeWhitespace } from '../text/normalize';

import type { GlossaryEntry } from './types';
import type { ChapterMemoryRecord, Entity } from '../analysis/types';

export interface BuildGlossaryOptions {
  /** Order of the chapter being translated. Later chapters are ignored, earlier ones are kept. */
  readonly currentChapterOrder: number;
  /** Token budget for the whole list, estimated with `estimateTokens`. */
  readonly budgetTokens: number;
}

interface Candidate {
  term: string;
  translation: string | null;
  note: string | null;
  /** Chapter order where the term first appears. Used for output order and ranking. */
  order: number;
}

/**
 * Merges the glossaries of the chapters up to and including the current one, plus the canonical
 * names of the entities first seen by then, into one list that fits the token budget.
 *
 * Terms are matched by `normalizeName`. Earlier chapters win: the first translation seen for a term
 * is kept, and a later chapter only fills a translation or note that is still missing. This keeps
 * the rendering of a name consistent across chapters. An entity whose name or alias matches a
 * glossary term is not listed again. When the budget is tight, entries with a translation go first,
 * then the most recently introduced ones.
 */
export function buildGlossary(
  memories: readonly ChapterMemoryRecord[],
  entities: readonly Entity[],
  options: BuildGlossaryOptions,
): GlossaryEntry[] {
  if (!Number.isFinite(options.budgetTokens) || options.budgetTokens < 0) {
    throw new RangeError(`budgetTokens must be a non-negative number, got ${options.budgetTokens}`);
  }
  const current = options.currentChapterOrder;
  const byKey = new Map<string, Candidate>();
  const candidates: Candidate[] = [];

  const visible = memories
    .filter((record) => record.chapterOrder <= current)
    .sort((a, b) => a.chapterOrder - b.chapterOrder);
  for (const record of visible) {
    for (const item of record.memory.glossary) {
      const term = normalizeWhitespace(item.term);
      const key = normalizeName(term);
      if (!key) continue;
      const translation = clean(item.translation);
      const note = clean(item.note);
      const existing = byKey.get(key);
      if (existing) {
        existing.translation ??= translation;
        existing.note ??= note;
        continue;
      }
      const candidate: Candidate = { term, translation, note, order: record.chapterOrder };
      byKey.set(key, candidate);
      candidates.push(candidate);
    }
  }

  const visibleEntities = entities
    .filter((entity) => entity.firstChapterOrder <= current)
    .sort(
      (a, b) =>
        a.firstChapterOrder - b.firstChapterOrder || a.canonicalName.localeCompare(b.canonicalName),
    );
  for (const entity of visibleEntities) {
    const term = normalizeWhitespace(entity.canonicalName);
    const names = [term, ...aliasesThrough(entity, current).map(normalizeWhitespace)]
      .map((name) => normalizeName(name))
      .filter((key) => key !== '');
    if (names.length === 0 || names.some((key) => byKey.has(key))) continue;
    const candidate: Candidate = {
      term,
      translation: null,
      note: null,
      order: entity.firstChapterOrder,
    };
    for (const key of names) byKey.set(key, candidate);
    candidates.push(candidate);
  }

  const ranked = [...candidates].sort(
    (a, b) =>
      Number(b.translation !== null) - Number(a.translation !== null) ||
      b.order - a.order ||
      a.term.localeCompare(b.term),
  );
  const chosen: Candidate[] = [];
  let remaining = options.budgetTokens;
  for (const candidate of ranked) {
    const cost = estimateTokens(formatLine(candidate)) + 1;
    if (cost > remaining) continue;
    remaining -= cost;
    chosen.push(candidate);
  }

  return chosen
    .sort((a, b) => a.order - b.order || a.term.localeCompare(b.term))
    .map(({ term, translation, note }) => ({ term, translation, note }));
}

function clean(value: string | undefined): string | null {
  const cleaned = value === undefined ? '' : normalizeWhitespace(value);
  return cleaned === '' ? null : cleaned;
}

function formatLine(candidate: Candidate): string {
  return [candidate.term, candidate.translation, candidate.note].filter(Boolean).join(' ');
}
