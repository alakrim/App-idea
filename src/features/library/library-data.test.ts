import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { seriesRepo } from '@/db/repos/series-repo';

import { continueListening, readLibrary, sortLibrary } from './library-data';

function setup() {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { title: 'The Night Harbour', updatedAt: T0 + 3 }));
  seriesRepo.insert(db, seriesRow(2, { title: 'Amber Coast', updatedAt: T0 + 1 }));
  seriesRepo.insert(db, seriesRow(3, { title: 'Chapter Two Saga', updatedAt: T0 + 2 }));
  chapterRepo.insert(db, chapterRow(11, 1, 1, { title: 'Harbour I' }));
  chapterRepo.insert(db, chapterRow(12, 1, 2, { title: 'Harbour II' }));
  chapterRepo.insert(db, chapterRow(13, 1, 3, { title: 'Harbour III' }));
  chapterRepo.insert(db, chapterRow(21, 2, 1, { title: 'Coast I' }));
  return db;
}

describe('readLibrary', () => {
  it('reports chapter totals, and listening state only where something was played', () => {
    const db = setup();
    positionRepo.record(db, id(1), { chapterId: id(12), sentenceIdx: 4, positionMs: 0 }, T0 + 50);

    const entries = readLibrary(db);
    const harbour = entries.find((entry) => entry.series.id === id(1));

    expect(harbour?.series.chapterCount).toBe(3);
    expect(harbour?.listening).toMatchObject({
      chapterId: id(12),
      chapterTitle: 'Harbour II',
      chapterNumber: 2,
      chapterCount: 3,
      reachedShare: 2 / 3,
      updatedAt: T0 + 50,
    });
    expect(entries.find((entry) => entry.series.id === id(2))?.listening).toBeNull();
  });
});

describe('continueListening', () => {
  it('picks the series listened to most recently, and none when nothing was played', () => {
    const db = setup();
    positionRepo.record(db, id(2), { chapterId: id(21), sentenceIdx: 0, positionMs: 0 }, T0 + 10);
    positionRepo.record(db, id(1), { chapterId: id(11), sentenceIdx: 3, positionMs: 0 }, T0 + 99);

    expect(continueListening(readLibrary(db))?.series.id).toBe(id(1));
    expect(continueListening(readLibrary(setup()))).toBeNull();
  });
});

describe('sortLibrary', () => {
  it('keeps the repository order for recent and sorts titles naturally for title', () => {
    const entries = readLibrary(setup());

    expect(sortLibrary(entries, 'recent').map((e) => e.series.id)).toEqual([id(1), id(3), id(2)]);
    expect(sortLibrary(entries, 'title').map((e) => e.series.title)).toEqual([
      'Amber Coast',
      'Chapter Two Saga',
      'The Night Harbour',
    ]);
  });
});
