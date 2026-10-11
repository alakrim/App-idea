import { getTableName } from 'drizzle-orm';

import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import { vocabRepo } from '@/db/repos/vocab-repo';
import type { VocabItem } from '@/db/repos/vocab-repo';
import { chapters, series, sentences, vocab } from '@/db/schema';
import type { Db } from '@/db/types';
import { LANGUAGE_OPTIONS } from '@/features/settings/languages';

/** Tables the Vocab screen reads. A write to any of them re-runs the read. */
export const VOCAB_TABLES = [
  getTableName(vocab),
  getTableName(series),
  getTableName(chapters),
  getTableName(sentences),
];

export interface VocabCard {
  item: VocabItem;
  /** The sentence the item was saved from. Null if the chapter text is gone. */
  sentence: string | null;
}

export interface VocabSeriesGroup {
  seriesId: string;
  title: string;
  cards: VocabCard[];
}

export interface VocabLanguageGroup {
  lang: string;
  label: string;
  series: VocabSeriesGroup[];
}

export interface ReviewCard {
  id: string;
  term: string;
  translation: string | null;
  explanation: string | null;
  sentence: string | null;
}

/** Native name for a known language tag, or the tag itself in capitals. */
export function languageLabel(tag: string): string {
  const option = LANGUAGE_OPTIONS.find((o) => o.code.toLowerCase() === tag.toLowerCase());
  return option?.nativeName ?? tag.toUpperCase();
}

function sentenceOf(db: Db, item: VocabItem): string | null {
  return textRepo.getRange(db, item.chapterId, item.sentenceIdx, item.sentenceIdx)[0]?.text ?? null;
}

/**
 * Items matching `query`, grouped by language, then by series. Within a group the newest item
 * comes first. Languages keep the order of their newest item.
 */
export function readVocabGroups(db: Db, query: string): VocabLanguageGroup[] {
  const titles = new Map<string, string>();
  const languages = new Map<string, Map<string, VocabSeriesGroup>>();
  for (const item of vocabRepo.list(db, { query })) {
    if (!titles.has(item.seriesId)) {
      titles.set(item.seriesId, seriesRepo.get(db, item.seriesId)?.title ?? 'Untitled series');
    }
    const bySeries = languages.get(item.lang) ?? new Map<string, VocabSeriesGroup>();
    languages.set(item.lang, bySeries);
    const group = bySeries.get(item.seriesId) ?? {
      seriesId: item.seriesId,
      title: titles.get(item.seriesId) ?? 'Untitled series',
      cards: [],
    };
    bySeries.set(item.seriesId, group);
    group.cards.push({ item, sentence: sentenceOf(db, item) });
  }
  return [...languages].map(([lang, bySeries]) => ({
    lang,
    label: languageLabel(lang),
    series: [...bySeries.values()],
  }));
}

/** Every item, for a review session. Cards not yet known come first, then the least recently reviewed. */
export function readReviewCards(db: Db): ReviewCard[] {
  return vocabRepo
    .list(db)
    .sort((a, b) => Number(a.known) - Number(b.known) || (a.reviewedAt ?? 0) - (b.reviewedAt ?? 0))
    .map((item) => ({
      id: item.id,
      term: item.term,
      translation: item.translation,
      explanation: item.explanation,
      sentence: sentenceOf(db, item),
    }));
}

/** Total saved items, ignoring any search. */
export function readVocabTotal(db: Db): number {
  return vocabRepo.list(db).length;
}
