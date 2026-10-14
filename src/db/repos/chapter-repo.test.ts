import { DbValidationError } from '../json-column';
import { chapterRepo } from './chapter-repo';
import { positionRepo } from './position-repo';
import { seriesRepo } from './series-repo';
import { textRepo } from './text-repo';
import { usageRepo } from './usage-repo';
import { chapterRow, chapterText, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

import type { Db } from '../types';

function seedSeries(db: Db, chapterCount: number): void {
  seriesRepo.insert(db, seriesRow(1));
  for (let n = 1; n <= chapterCount; n++) {
    chapterRepo.insert(db, chapterRow(n, 1, n));
  }
}

function orderedIds(db: Db): string[] {
  return chapterRepo.listBySeries(db, id(1)).map((c) => c.id);
}

describe('chapterRepo', () => {
  it('round-trips the source JSON and lists chapters in order', () => {
    const { db } = createTestDb();
    seedSeries(db, 0);
    const pdf = chapterRow(2, 1, 2, {
      source: { kind: 'pdf', fileUri: 'file:///a.pdf', fileName: 'a.pdf', pageRange: [1, 4] },
    });
    chapterRepo.insert(db, chapterRow(1, 1, 3));
    chapterRepo.insert(db, pdf);

    expect(chapterRepo.get(db, id(2))).toEqual(pdf);
    expect(chapterRepo.listBySeries(db, id(1)).map((c) => c.order)).toEqual([2, 3]);
  });

  it('updates status and patches fields, leaving untouched fields alone', () => {
    const { db } = createTestDb();
    seedSeries(db, 1);

    chapterRepo.setStatus(db, id(1), 'processing', T0 + 1);
    chapterRepo.update(db, id(1), { title: 'Prologue' });

    expect(chapterRepo.get(db, id(1))).toMatchObject({
      status: 'processing',
      title: 'Prologue',
      updatedAt: T0 + 1,
      durationMs: 60_000,
    });
  });

  it('moves a chapter between neighbours using a fractional order', () => {
    const { db } = createTestDb();
    seedSeries(db, 3);

    chapterRepo.moveBetween(db, id(3), { previousId: id(1), nextId: id(2) }, T0 + 1);

    expect(orderedIds(db)).toEqual([id(1), id(3), id(2)]);
    expect(chapterRepo.get(db, id(3))?.order).toBe(1.5);
    expect(chapterRepo.get(db, id(3))?.updatedAt).toBe(T0 + 1);
  });

  it('moves a chapter to the start and to the end of a series', () => {
    const { db } = createTestDb();
    seedSeries(db, 3);

    chapterRepo.moveBetween(db, id(3), { previousId: null, nextId: id(1) }, T0);
    expect(orderedIds(db)).toEqual([id(3), id(1), id(2)]);

    chapterRepo.moveBetween(db, id(3), { previousId: id(2), nextId: null }, T0);
    expect(orderedIds(db)).toEqual([id(1), id(2), id(3)]);
  });

  it('renumbers the series when the fractional gap is exhausted, keeping the requested order', () => {
    const { db } = createTestDb();
    seedSeries(db, 0);
    chapterRepo.insert(db, chapterRow(100, 1, 1));
    chapterRepo.insert(db, chapterRow(101, 1, 2));
    const expected = [id(100), id(101)];
    // Each chapter is placed right after 100, so the gap halves every step until it collapses.
    for (let n = 102; n < 102 + 70; n++) {
      chapterRepo.insert(db, chapterRow(n, 1, 1000 + n));
      chapterRepo.moveBetween(db, id(n), { previousId: id(100), nextId: expected[1] ?? null }, T0);
      expected.splice(1, 0, id(n));
    }

    expect(orderedIds(db)).toEqual(expected);
    const orders = chapterRepo.listBySeries(db, id(1)).map((c) => c.order);
    expect(orders.every((o, i) => i === 0 || o > (orders[i - 1] ?? -Infinity))).toBe(true);
  });

  it('rejects neighbours that are not adjacent or not in the series', () => {
    const { db } = createTestDb();
    seedSeries(db, 3);

    expect(() =>
      chapterRepo.moveBetween(db, id(3), { previousId: id(1), nextId: id(1) }, T0),
    ).toThrow();
    expect(() =>
      chapterRepo.moveBetween(db, id(1), { previousId: id(99), nextId: null }, T0),
    ).toThrow(/not in the same series/);
  });

  it('keeps listening-position order snapshots in step with a move', () => {
    const { db } = createTestDb();
    seedSeries(db, 3);
    positionRepo.record(db, id(1), { chapterId: id(3), sentenceIdx: 0, positionMs: 0 }, T0);

    chapterRepo.moveBetween(db, id(3), { previousId: null, nextId: id(1) }, T0);

    expect(positionRepo.get(db, id(1))?.furthest.chapterOrder).toBe(
      chapterRepo.get(db, id(3))?.order,
    );
  });

  it('deletes a chapter with its text, and keeps its usage rows with the chapter unlinked', () => {
    const { db } = createTestDb();
    seedSeries(db, 1);
    textRepo.replaceChapterText(db, id(1), chapterText(1, ['One.', 'Two.']));
    usageRepo.insert(db, {
      id: id(50),
      at: T0,
      chapterId: id(1),
      stage: 'analyze',
      model: 'm',
      promptTokens: 10,
      completionTokens: 5,
      audioSeconds: null,
      costUsd: 0.01,
      generationId: null,
    });

    chapterRepo.delete(db, id(1));

    expect(chapterRepo.get(db, id(1))).toBeNull();
    expect(textRepo.getRange(db, id(1), 0, 10)).toEqual([]);
    expect(usageRepo.totalsBy(db, 'chapter')).toEqual([
      {
        key: null,
        calls: 1,
        promptTokens: 10,
        completionTokens: 5,
        costUsd: 0.01,
        unknownCalls: 0,
      },
    ]);
  });

  it('moves a position on the deleted chapter to the end of the nearest previous chapter with text', () => {
    const { db } = createTestDb();
    seedSeries(db, 3);
    textRepo.replaceChapterText(db, id(1), chapterText(1, ['One.', 'Two.', 'Three.']));
    // Chapter 2 has no text, so the nearest previous chapter with text is chapter 1.
    positionRepo.record(db, id(1), { chapterId: id(3), sentenceIdx: 0, positionMs: 0 }, T0);

    chapterRepo.delete(db, id(3));

    expect(positionRepo.get(db, id(1))).toEqual({
      seriesId: id(1),
      current: { chapterId: id(1), chapterOrder: 1, sentenceIdx: 2 },
      furthest: { chapterId: id(1), chapterOrder: 1, sentenceIdx: 2 },
      updatedAt: T0,
    });
  });

  it('moves only the point that sits on the deleted chapter, and keeps the other one', () => {
    const { db } = createTestDb();
    seedSeries(db, 3);
    textRepo.replaceChapterText(db, id(1), chapterText(1, ['One.', 'Two.', 'Three.']));
    textRepo.replaceChapterText(db, id(2), chapterText(2, ['Four.', 'Five.']));
    // Furthest reaches chapter 2, then the listener seeks back to chapter 1.
    positionRepo.record(db, id(1), { chapterId: id(2), sentenceIdx: 0, positionMs: 0 }, T0);
    positionRepo.record(db, id(1), { chapterId: id(1), sentenceIdx: 1, positionMs: 0 }, T0 + 1);

    chapterRepo.delete(db, id(2));

    expect(positionRepo.get(db, id(1))).toMatchObject({
      current: { chapterId: id(1), chapterOrder: 1, sentenceIdx: 1 },
      furthest: { chapterId: id(1), chapterOrder: 1, sentenceIdx: 2 },
    });
  });

  it('removes the position row when no previous chapter has text', () => {
    const { db } = createTestDb();
    seedSeries(db, 2);
    textRepo.replaceChapterText(db, id(2), chapterText(2, ['Only.']));
    positionRepo.record(db, id(1), { chapterId: id(2), sentenceIdx: 0, positionMs: 0 }, T0);

    chapterRepo.delete(db, id(2));

    expect(positionRepo.get(db, id(1))).toBeNull();
  });

  it('leaves the listening position alone when the deleted chapter is not on it', () => {
    const { db } = createTestDb();
    seedSeries(db, 2);
    textRepo.replaceChapterText(db, id(1), chapterText(1, ['One.']));
    positionRepo.record(db, id(1), { chapterId: id(1), sentenceIdx: 0, positionMs: 0 }, T0);

    chapterRepo.delete(db, id(2));

    expect(positionRepo.get(db, id(1))?.furthest.chapterId).toBe(id(1));
  });

  it('rejects a corrupt JSON source on read instead of returning it', () => {
    const { db, sqlite } = createTestDb();
    seedSeries(db, 1);
    sqlite
      .prepare(`UPDATE chapters SET source = '{"kind":"carrier-pigeon"}' WHERE id = ?`)
      .run(id(1));

    expect(() => chapterRepo.get(db, id(1))).toThrow(DbValidationError);

    sqlite.prepare(`UPDATE chapters SET source = 'not json' WHERE id = ?`).run(id(1));
    expect(() => chapterRepo.listBySeries(db, id(1))).toThrow(/not valid JSON/);
  });
});
