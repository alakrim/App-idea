import { and, desc, eq, or, sql } from 'drizzle-orm';

import { VocabSchema } from '../../core/domain';
import { vocab } from '../schema';

import type { Vocab } from '../../core/domain';
import type { Db } from '../types';
import type { SQL } from 'drizzle-orm';

type VocabRow = typeof vocab.$inferSelect;

/** A saved item, with its flashcard state (see VocabSchema). */
export type VocabItem = Vocab;

/** What the learner saved. The explanation is filled later, so it starts empty. */
export interface NewVocabInput {
  id: string;
  seriesId: string;
  chapterId: string;
  sentenceIdx: number;
  term: string;
  lang: string;
  createdAt: number;
}

export interface VocabFilter {
  seriesId?: string;
  lang?: string;
  /** Case-insensitive substring match over the term, translation and explanation. */
  query?: string;
}

export interface VocabExplanation {
  translation: string;
  explanation: string;
}

function toItem(row: VocabRow): VocabItem {
  return VocabSchema.parse(row);
}

function matchesQuery(query: string): SQL {
  const needle = query.trim().toLowerCase();
  return or(
    sql`instr(lower(${vocab.term}), ${needle}) > 0`,
    sql`instr(lower(coalesce(${vocab.translation}, '')), ${needle}) > 0`,
    sql`instr(lower(coalesce(${vocab.explanation}, '')), ${needle}) > 0`,
  ) as SQL;
}

export const vocabRepo = {
  insert(db: Db, input: NewVocabInput): void {
    db.insert(vocab)
      .values({ ...input, explanation: null, translation: null, reviewedAt: null, known: false })
      .run();
  },

  get(db: Db, id: string): VocabItem | null {
    const row = db.select().from(vocab).where(eq(vocab.id, id)).get();
    return row ? toItem(row) : null;
  },

  /** Newest first. Empty filters match everything. A blank query is ignored. */
  list(db: Db, filter: VocabFilter = {}): VocabItem[] {
    const clauses: SQL[] = [];
    if (filter.seriesId !== undefined) clauses.push(eq(vocab.seriesId, filter.seriesId));
    if (filter.lang !== undefined) clauses.push(eq(vocab.lang, filter.lang));
    if (filter.query !== undefined && filter.query.trim() !== '') {
      clauses.push(matchesQuery(filter.query));
    }
    return db
      .select()
      .from(vocab)
      .where(clauses.length === 0 ? undefined : and(...clauses))
      .orderBy(desc(vocab.createdAt), desc(vocab.id))
      .all()
      .map(toItem);
  },

  delete(db: Db, id: string): void {
    db.delete(vocab).where(eq(vocab.id, id)).run();
  },

  /** Fills the explanation fetched for a saved item. */
  setExplanation(db: Db, id: string, value: VocabExplanation): void {
    db.update(vocab)
      .set({ translation: value.translation, explanation: value.explanation })
      .where(eq(vocab.id, id))
      .run();
  },

  /** Records a flashcard verdict. "Again" is stored as not known, so it comes back in review. */
  setReviewed(db: Db, id: string, known: boolean, reviewedAt: number): void {
    db.update(vocab).set({ known, reviewedAt }).where(eq(vocab.id, id)).run();
  },
};
