import { and, asc, between, eq, inArray, sql } from 'drizzle-orm';

import { chapters, paragraphs, sentences } from '../schema';

import type { Paragraph, Sentence, SentenceRef } from '../../core/domain';
import type { Db } from '../types';
import type { SQL } from 'drizzle-orm';

/** Rows are inserted in chunks to stay well under SQLite's bound-parameter limit. */
const INSERT_CHUNK_SIZE = 100;
/**
 * Each translation chunk binds four values per sentence and one per idx in its IN list, so 120
 * sentences stay well under SQLite's bound-parameter limit.
 */
const TRANSLATION_CHUNK_SIZE = 120;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
/** The trigram index only matches terms of at least this many characters. */
const TRIGRAM_MIN_LENGTH = 3;
/** Han, Hiragana and Katakana: scripts written without spaces between words. */
const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/u;

export interface ChapterText {
  paragraphs: Paragraph[];
  sentences: Sentence[];
}

export interface Translation {
  idx: number;
  /** Null when the sentence has no usable translation, so the UI shows the original. */
  translated: string | null;
}

/** A sentence with the language its translation is in, as stored. */
export interface SentenceRow extends Sentence {
  readonly translatedLang: string | null;
}

export interface SpoilerSafeQuery {
  seriesId: string;
  /** The furthest-listened point. Only text up to and including it can be returned. */
  cutoff: SentenceRef;
  query: string;
  limit?: number;
}

export type SearchHit = Sentence & { chapterOrder: number };

function tokenize(query: string): string[] {
  return query
    .split(/\s+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** One quoted phrase per token, ANDed. Doubled quotes keep user input from breaking MATCH. */
function toFtsMatch(tokens: string[]): string {
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
}

const SEARCH_COLUMNS = sql`
  s.chapter_id AS "chapterId",
  s.idx AS "idx",
  s.paragraph_idx AS "paragraphIdx",
  s.text AS "text",
  s.translated AS "translated",
  s.char_count AS "charCount",
  c."order" AS "chapterOrder"
`;

function ftsSearch(
  db: Db,
  table: 'sentences_fts' | 'sentences_fts_trigram',
  visible: SQL,
  match: string,
  limit: number,
): SearchHit[] {
  const name = sql.raw(table);
  return db.all<SearchHit>(sql`
    SELECT ${SEARCH_COLUMNS}
    FROM ${name}
    JOIN sentences s ON s.id = ${name}.rowid
    JOIN chapters c ON c.id = s.chapter_id
    WHERE ${name} MATCH ${match} AND ${visible}
    ORDER BY ${name}.rank, c."order", s.idx
    LIMIT ${limit}
  `);
}

/** Scoped substring scan for CJK terms too short for the trigram index. Every term must appear. */
function likeSearch(db: Db, visible: SQL, tokens: string[], limit: number): SearchHit[] {
  const termClauses = tokens.map(
    (t) => sql`(instr(s.text, ${t}) > 0 OR instr(coalesce(s.translated, ''), ${t}) > 0)`,
  );
  return db.all<SearchHit>(sql`
    SELECT ${SEARCH_COLUMNS}
    FROM sentences s
    JOIN chapters c ON c.id = s.chapter_id
    WHERE ${visible} AND ${sql.join(termClauses, sql` AND `)}
    ORDER BY c."order", s.idx
    LIMIT ${limit}
  `);
}

export const textRepo = {
  /**
   * Atomically replaces a chapter's paragraphs and sentences. A failed insert rolls back to the
   * previous text. FTS rows follow through the sentences triggers, including on cascade deletes.
   */
  replaceChapterText(db: Db, chapterId: string, text: ChapterText): void {
    for (const sentence of text.sentences) {
      if (sentence.chapterId !== chapterId) {
        throw new Error(`Sentence ${sentence.idx} belongs to chapter ${sentence.chapterId}`);
      }
    }

    db.transaction((tx) => {
      tx.delete(sentences).where(eq(sentences.chapterId, chapterId)).run();
      tx.delete(paragraphs).where(eq(paragraphs.chapterId, chapterId)).run();

      for (let i = 0; i < text.paragraphs.length; i += INSERT_CHUNK_SIZE) {
        const chunk = text.paragraphs.slice(i, i + INSERT_CHUNK_SIZE);
        tx.insert(paragraphs)
          .values(chunk.map((p) => ({ ...p, chapterId })))
          .run();
      }
      for (let i = 0; i < text.sentences.length; i += INSERT_CHUNK_SIZE) {
        const chunk = text.sentences.slice(i, i + INSERT_CHUNK_SIZE);
        tx.insert(sentences).values(chunk).run();
      }
    });
  },

  /** Sentences with idx in [fromIdx, toIdx], inclusive, in reading order. */
  getRange(db: Db, chapterId: string, fromIdx: number, toIdx: number): SentenceRow[] {
    return db
      .select({
        chapterId: sentences.chapterId,
        idx: sentences.idx,
        paragraphIdx: sentences.paragraphIdx,
        text: sentences.text,
        translated: sentences.translated,
        translatedLang: sentences.translatedLang,
        charCount: sentences.charCount,
      })
      .from(sentences)
      .where(and(eq(sentences.chapterId, chapterId), between(sentences.idx, fromIdx, toIdx)))
      .orderBy(asc(sentences.idx))
      .all();
  },

  listParagraphs(db: Db, chapterId: string): Paragraph[] {
    return db
      .select({
        idx: paragraphs.idx,
        sentenceStart: paragraphs.sentenceStart,
        sentenceEnd: paragraphs.sentenceEnd,
        kind: paragraphs.kind,
      })
      .from(paragraphs)
      .where(eq(paragraphs.chapterId, chapterId))
      .orderBy(asc(paragraphs.idx))
      .all();
  },

  /**
   * Writes translations for one chapter in one transaction, one UPDATE per chunk of sentences rather
   * than one per sentence. A repeated idx keeps its last translation. Every translation is stamped
   * with `lang`, the language it was written in. A sentence with no translation stores no language.
   * Each UPDATE fires the search triggers once per row, as before, but the statement overhead is
   * paid per chunk.
   */
  setTranslations(db: Db, chapterId: string, translations: Translation[], lang: string): void {
    const latest = new Map(translations.map(({ idx, translated }) => [idx, translated] as const));
    const entries = Array.from(latest);
    if (entries.length === 0) return;
    db.transaction((tx) => {
      for (let start = 0; start < entries.length; start += TRANSLATION_CHUNK_SIZE) {
        const chunk = entries.slice(start, start + TRANSLATION_CHUNK_SIZE);
        const branches = sql.join(
          chunk.map(([idx, translated]) => sql`WHEN ${idx} THEN ${translated}`),
          sql` `,
        );
        const langBranches = sql.join(
          chunk.map(([idx, translated]) => sql`WHEN ${idx} THEN ${translated === null ? null : lang}`),
          sql` `,
        );
        tx.update(sentences)
          .set({
            translated: sql`CASE ${sentences.idx} ${branches} END`,
            translatedLang: sql`CASE ${sentences.idx} ${langBranches} END`,
          })
          .where(
            and(
              eq(sentences.chapterId, chapterId),
              inArray(
                sentences.idx,
                chunk.map(([idx]) => idx),
              ),
            ),
          )
          .run();
      }
    });
  },

  /**
   * Drops every stored translation of a series' chapters, so none in another language can be read
   * aloud. Runs in the same transaction as the target-language change that makes them stale.
   */
  clearTranslationsOfSeries(db: Db, seriesId: string): void {
    const chapterIds = db
      .select({ id: chapters.id })
      .from(chapters)
      .where(eq(chapters.seriesId, seriesId));
    db.update(sentences)
      .set({ translated: null, translatedLang: null })
      .where(inArray(sentences.chapterId, chapterIds))
      .run();
  },

  /**
   * Full-text search that never returns text past the listener's furthest position. A hit is
   * visible only if its chapter order is below the cutoff chapter's order, or it is in the cutoff
   * chapter with idx <= the cutoff sentence. The filter is in the WHERE clause of every path.
   *
   * Routing: Latin-script queries use the unicode61 word index. Queries containing CJK use the
   * trigram index when every term has 3+ characters, and otherwise a scoped LIKE scan.
   */
  search(db: Db, input: SpoilerSafeQuery): SearchHit[] {
    const tokens = tokenize(input.query);
    if (tokens.length === 0) return [];

    const cutoffChapter = db
      .select({ seriesId: chapters.seriesId, order: chapters.order })
      .from(chapters)
      .where(eq(chapters.id, input.cutoff.chapterId))
      .get();
    if (!cutoffChapter || cutoffChapter.seriesId !== input.seriesId) return [];

    const limit = Math.min(Math.max(input.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
    const visible = sql`c.series_id = ${input.seriesId} AND (
      c."order" < ${cutoffChapter.order}
      OR (c."order" = ${cutoffChapter.order} AND s.idx <= ${input.cutoff.idx})
    )`;

    const hasCjk = tokens.some((t) => CJK_PATTERN.test(t));
    const trigramUsable = tokens.every((t) => [...t].length >= TRIGRAM_MIN_LENGTH);

    if (!hasCjk) return ftsSearch(db, 'sentences_fts', visible, toFtsMatch(tokens), limit);
    if (trigramUsable) {
      return ftsSearch(db, 'sentences_fts_trigram', visible, toFtsMatch(tokens), limit);
    }
    return likeSearch(db, visible, tokens, limit);
  },
};
