import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { vocabRepo } from './vocab-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

function seed() {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1, { targetLang: 'it' }));
  seriesRepo.insert(testDb.db, seriesRow(2, { targetLang: 'fr' }));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  chapterRepo.insert(testDb.db, chapterRow(2, 2, 1));
  return testDb;
}

function add(
  db: ReturnType<typeof seed>['db'],
  n: number,
  overrides: { seriesId?: string; lang?: string; term?: string } = {},
): void {
  vocabRepo.insert(db, {
    id: id(400 + n),
    seriesId: overrides.seriesId ?? id(1),
    chapterId: overrides.seriesId === id(2) ? id(2) : id(1),
    sentenceIdx: n,
    term: overrides.term ?? `term ${n}`,
    lang: overrides.lang ?? 'it',
    createdAt: T0 + n,
  });
}

describe('vocabRepo', () => {
  it('inserts an item with no explanation and no review state', () => {
    const { db } = seed();
    add(db, 1, { term: 'Ciao' });

    expect(vocabRepo.get(db, id(401))).toEqual({
      id: id(401),
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 1,
      term: 'Ciao',
      lang: 'it',
      explanation: null,
      translation: null,
      createdAt: T0 + 1,
      reviewedAt: null,
      known: false,
    });
  });

  it('lists newest first and filters by series and language', () => {
    const { db } = seed();
    add(db, 1, { lang: 'it' });
    add(db, 2, { lang: 'fr', seriesId: id(2) });
    add(db, 3, { lang: 'it' });

    expect(vocabRepo.list(db).map((v) => v.term)).toEqual(['term 3', 'term 2', 'term 1']);
    expect(vocabRepo.list(db, { lang: 'fr' }).map((v) => v.term)).toEqual(['term 2']);
    expect(vocabRepo.list(db, { seriesId: id(1) }).map((v) => v.term)).toEqual([
      'term 3',
      'term 1',
    ]);
  });

  it('searches term, translation and explanation case-insensitively, ignoring blank queries', () => {
    const { db } = seed();
    add(db, 1, { term: 'Bellissimo' });
    add(db, 2, { term: 'Grazie' });
    vocabRepo.setExplanation(db, id(402), {
      translation: 'thank you',
      explanation: 'A polite way to say thanks.',
    });

    expect(vocabRepo.list(db, { query: 'bELLIS' }).map((v) => v.term)).toEqual(['Bellissimo']);
    expect(vocabRepo.list(db, { query: 'THANK' }).map((v) => v.term)).toEqual(['Grazie']);
    expect(vocabRepo.list(db, { query: 'polite' }).map((v) => v.term)).toEqual(['Grazie']);
    expect(vocabRepo.list(db, { query: '   ' })).toHaveLength(2);
    expect(vocabRepo.list(db, { query: 'no match here' })).toEqual([]);
  });

  it('treats LIKE wildcards in the query as plain text', () => {
    const { db } = seed();
    add(db, 1, { term: '100% sure' });
    add(db, 2, { term: 'other' });

    expect(vocabRepo.list(db, { query: '%' }).map((v) => v.term)).toEqual(['100% sure']);
  });

  it('fills the explanation and records reviews, with Again stored as not known', () => {
    const { db } = seed();
    add(db, 1);

    vocabRepo.setExplanation(db, id(401), { translation: 'hi', explanation: 'A greeting.' });
    vocabRepo.setReviewed(db, id(401), true, T0 + 10);
    vocabRepo.setReviewed(db, id(401), false, T0 + 20);

    expect(vocabRepo.get(db, id(401))).toMatchObject({
      translation: 'hi',
      explanation: 'A greeting.',
      reviewedAt: T0 + 20,
      known: false,
    });
  });

  it('deletes one item', () => {
    const { db } = seed();
    add(db, 1);
    add(db, 2);

    vocabRepo.delete(db, id(401));

    expect(vocabRepo.get(db, id(401))).toBeNull();
    expect(vocabRepo.list(db)).toHaveLength(1);
  });
});
