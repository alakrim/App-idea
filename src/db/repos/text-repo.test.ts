import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { textRepo } from './text-repo';
import { chapterRow, chapterText, id, seriesRow } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

import type { Db } from '../types';

/**
 * Series 1 has three chapters in reading order: 1 (order 1), 2 (order 2), 3 (order 3).
 * The word "dragon" appears in the first and last sentence of chapter 1, in chapter 2, and in
 * chapter 3, which is the spoiler the cutoff must hide.
 */
function seedBook(): ReturnType<typeof createTestDb> {
  const testDb = createTestDb();
  const { db } = testDb;
  seriesRepo.insert(db, seriesRow(1));
  chapterRepo.insert(db, chapterRow(1, 1, 1));
  chapterRepo.insert(db, chapterRow(2, 1, 2));
  chapterRepo.insert(db, chapterRow(3, 1, 3));
  textRepo.replaceChapterText(
    db,
    id(1),
    chapterText(1, ['The dragon sleeps.', 'A knight rides out.', 'The dragon wakes.']),
  );
  textRepo.replaceChapterText(db, id(2), chapterText(2, ['The dragon flies north.']));
  textRepo.replaceChapterText(db, id(3), chapterText(3, ['The dragon dies in the end.']));
  return testDb;
}

/** Hits as "chapterOrder:idx", sorted, because bm25 ranking is not what these tests check. */
const hits = (db: Db, cutoffChapter: number, cutoffIdx: number, query: string): string[] =>
  textRepo
    .search(db, {
      seriesId: id(1),
      cutoff: { chapterId: id(cutoffChapter), idx: cutoffIdx },
      query,
    })
    .map((s) => `${s.chapterOrder}:${s.idx}`)
    .sort();

describe('textRepo bulk writes', () => {
  it('inserts paragraphs and sentences and reads an inclusive range in order', () => {
    const { db } = seedBook();

    expect(textRepo.getRange(db, id(1), 1, 2).map((s) => s.text)).toEqual([
      'A knight rides out.',
      'The dragon wakes.',
    ]);
    expect(textRepo.listParagraphs(db, id(1))).toEqual([
      { idx: 0, sentenceStart: 0, sentenceEnd: 3, kind: 'text' },
    ]);
  });

  it('rolls back a failed replacement and keeps the previous text', () => {
    const { db } = seedBook();
    const base = chapterText(1, ['Replacement one.', 'Replacement two.']);
    // Both sentences claim idx 0, which violates the (chapter_id, idx) unique index.
    const broken = { ...base, sentences: base.sentences.map((s) => ({ ...s, idx: 0 })) };

    expect(() => textRepo.replaceChapterText(db, id(1), broken)).toThrow();

    expect(textRepo.getRange(db, id(1), 0, 10)).toHaveLength(3);
    expect(hits(db, 3, 99, 'dragon')).toEqual(['1:0', '1:2', '2:0', '3:0']);
  });

  it('refuses sentences that belong to another chapter before writing anything', () => {
    const { db } = seedBook();
    const foreign = chapterText(2, ['Wrong chapter.']);

    expect(() => textRepo.replaceChapterText(db, id(1), foreign)).toThrow(/belongs to chapter/);
    expect(textRepo.getRange(db, id(1), 0, 10)).toHaveLength(3);
  });

  it('writes translations in bulk and indexes them for search', () => {
    const { db } = seedBook();

    textRepo.setTranslations(db, id(1), [{ idx: 1, translated: 'Un chevalier part.' }]);

    expect(textRepo.getRange(db, id(1), 1, 1)[0]?.translated).toBe('Un chevalier part.');
    expect(
      textRepo
        .search(db, {
          seriesId: id(1),
          cutoff: { chapterId: id(1), idx: 2 },
          query: 'chevalier',
        })
        .map((s) => s.idx),
    ).toEqual([1]);
  });

  it('drops search rows for sentences that are replaced', () => {
    const { db } = seedBook();

    textRepo.replaceChapterText(db, id(2), chapterText(2, ['A wizard arrives.']));

    expect(hits(db, 3, 99, 'dragon')).toEqual(['1:0', '1:2', '3:0']);
    expect(hits(db, 3, 99, 'wizard')).toEqual(['2:0']);
  });
});

describe('textRepo.search spoiler cutoff', () => {
  it('never returns a sentence after the cutoff sentence in the cutoff chapter', () => {
    const { db } = seedBook();

    expect(hits(db, 1, 0, 'dragon')).toEqual(['1:0']);
    expect(hits(db, 1, 1, 'dragon')).toEqual(['1:0']);
    expect(hits(db, 1, 2, 'dragon')).toEqual(['1:0', '1:2']);
  });

  it('returns earlier chapters in full and nothing from later chapters', () => {
    const { db } = seedBook();

    expect(hits(db, 2, 0, 'dragon')).toEqual(['1:0', '1:2', '2:0']);
  });

  it('applies the cutoff sentence rule only inside the cutoff chapter (earlier chapters ignore idx)', () => {
    const { db } = seedBook();

    // Cutoff at chapter 2, idx 0: chapter 1 idx 2 is past that index but in an earlier chapter.
    expect(hits(db, 2, 0, 'dragon')).toContain('1:2');
    // Inside the cutoff chapter the same index is the boundary: idx 0 is in, anything later is out.
    expect(hits(db, 1, 0, 'dragon')).not.toContain('1:2');
  });

  it('keeps later chapters hidden even when their translation matches', () => {
    const { db } = seedBook();
    textRepo.setTranslations(db, id(3), [{ idx: 0, translated: 'Le dragon meurt.' }]);

    expect(hits(db, 2, 0, 'dragon')).not.toContain('3:0');
    expect(hits(db, 2, 0, 'meurt')).toEqual([]);
  });

  it('follows the live chapter order after a reorder', () => {
    const { db } = seedBook();
    chapterRepo.moveBetween(db, id(3), { previousId: null, nextId: id(1) }, 0);

    // Chapter 3 now sorts before chapter 1, so it is visible from chapter 1's cutoff.
    expect(hits(db, 1, 0, 'dragon')).toEqual(['0:0', '1:0']);
  });

  it('returns nothing when the cutoff chapter belongs to another series', () => {
    const { db } = seedBook();
    seriesRepo.insert(db, seriesRow(2));
    chapterRepo.insert(db, chapterRow(9, 2, 1));

    expect(
      textRepo.search(db, {
        seriesId: id(2),
        cutoff: { chapterId: id(1), idx: 99 },
        query: 'dragon',
      }),
    ).toEqual([]);
  });

  it('matches accented Latin text without its diacritics', () => {
    const { db } = seedBook();
    textRepo.replaceChapterText(db, id(2), chapterText(2, ['Café au lait for the dragon.']));

    expect(hits(db, 2, 0, 'cafe')).toEqual(['2:0']);
  });

  it('uses the trigram index for CJK terms of three or more characters', () => {
    const { db } = seedBook();
    textRepo.replaceChapterText(db, id(2), chapterText(2, ['他们在山里发现了一条龙。']));

    expect(hits(db, 3, 99, '一条龙')).toEqual(['2:0']);
    expect(hits(db, 1, 99, '一条龙')).toEqual([]);
  });

  it('falls back to a scoped scan for CJK terms shorter than the trigram minimum', () => {
    const { db } = seedBook();
    textRepo.replaceChapterText(db, id(2), chapterText(2, ['他们在山里发现了一条龙。']));
    textRepo.replaceChapterText(db, id(3), chapterText(3, ['龙在山里睡觉。']));

    expect(hits(db, 2, 0, '发现')).toEqual(['2:0']);
    expect(hits(db, 3, 0, '龙')).toEqual(['2:0', '3:0']);
    expect(hits(db, 1, 99, '龙')).toEqual([]);
  });

  it('treats query syntax as plain text', () => {
    const { db } = seedBook();

    expect(hits(db, 3, 99, '"dragon')).toEqual(['1:0', '1:2', '2:0', '3:0']);
    expect(hits(db, 3, 99, 'NOT dragon OR')).toEqual([]);
    expect(hits(db, 3, 99, '   ')).toEqual([]);
  });

  it('clamps the limit', () => {
    const { db } = seedBook();

    expect(
      textRepo.search(db, {
        seriesId: id(1),
        cutoff: { chapterId: id(3), idx: 99 },
        query: 'dragon',
        limit: 2,
      }),
    ).toHaveLength(2);
  });
});
