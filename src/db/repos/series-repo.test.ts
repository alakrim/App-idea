import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { textRepo } from './text-repo';
import { chapterRow, chapterText, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

describe('seriesRepo', () => {
  it('round-trips a series and applies a patch', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));

    seriesRepo.update(db, id(1), { title: 'Renamed', coverTint: '#A1B2C3', updatedAt: T0 + 1 });

    expect(seriesRepo.get(db, id(1))).toEqual(
      seriesRow(1, { title: 'Renamed', coverTint: '#A1B2C3', updatedAt: T0 + 1 }),
    );
    expect(seriesRepo.get(db, id(99))).toBeNull();
  });

  it('lists series with chapter counts and total duration, most recently updated first', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1, { updatedAt: T0 }));
    seriesRepo.insert(db, seriesRow(2, { updatedAt: T0 + 10 }));
    seriesRepo.insert(db, seriesRow(3, { updatedAt: T0 + 5 }));
    chapterRepo.insert(db, chapterRow(1, 1, 1, { durationMs: 60_000 }));
    chapterRepo.insert(db, chapterRow(2, 1, 2, { durationMs: 90_000 }));
    chapterRepo.insert(db, chapterRow(3, 1, 3, { durationMs: null }));

    const list = seriesRepo.list(db);

    expect(list.map((s) => [s.id, s.chapterCount, s.totalDurationMs])).toEqual([
      [id(2), 0, 0],
      [id(3), 0, 0],
      [id(1), 3, 150_000],
    ]);
  });

  it('deletes a series and cascades to chapters, text, jobs, positions and FTS', () => {
    const { db, sqlite } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    textRepo.replaceChapterText(db, id(1), chapterText(1, ['The dragon sleeps.']));

    seriesRepo.delete(db, id(1));

    const count = (table: string): number =>
      (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(count('chapters')).toBe(0);
    expect(count('paragraphs')).toBe(0);
    expect(count('sentences')).toBe(0);
    expect(count('sentences_fts')).toBe(0);
    expect(
      textRepo.search(db, {
        seriesId: id(1),
        cutoff: { chapterId: id(1), idx: 0 },
        query: 'dragon',
      }),
    ).toEqual([]);
  });
});

describe('seriesRepo playback rate', () => {
  it('is empty until a speed is saved, then keeps the last one, without changing the series shape', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));

    expect(seriesRepo.getPlaybackRate(db, id(1))).toBeNull();
    seriesRepo.setPlaybackRate(db, id(1), 1.25);
    seriesRepo.setPlaybackRate(db, id(1), 1.5);

    expect(seriesRepo.getPlaybackRate(db, id(1))).toBe(1.5);
    expect(seriesRepo.get(db, id(1))).toEqual(seriesRow(1));
    expect(seriesRepo.list(db)[0]).not.toHaveProperty('playbackRate');
  });
});
