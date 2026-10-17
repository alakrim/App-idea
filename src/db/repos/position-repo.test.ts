import { chapterPositionRepo } from './chapter-position-repo';
import { chapterRepo } from './chapter-repo';
import { positionRepo } from './position-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

function setup(): ReturnType<typeof createTestDb> {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  chapterRepo.insert(testDb.db, chapterRow(2, 1, 2));
  return testDb;
}

describe('positionRepo', () => {
  it('returns null before anything has been recorded', () => {
    const { db } = setup();

    expect(positionRepo.get(db, id(1))).toBeNull();
  });

  it('moves the current position freely but the furthest position only forward', () => {
    const { db } = setup();

    positionRepo.record(db, id(1), { chapterId: id(1), sentenceIdx: 10, positionMs: 0 }, T0);
    positionRepo.record(db, id(1), { chapterId: id(2), sentenceIdx: 3, positionMs: 0 }, T0 + 1);
    const seekBack = positionRepo.record(
      db,
      id(1),
      { chapterId: id(1), sentenceIdx: 2, positionMs: 0 },
      T0 + 2,
    );

    expect(seekBack).toEqual({
      seriesId: id(1),
      current: { chapterId: id(1), chapterOrder: 1, sentenceIdx: 2 },
      furthest: { chapterId: id(2), chapterOrder: 2, sentenceIdx: 3 },
      updatedAt: T0 + 2,
    });
  });

  it('keeps the furthest point when the listener goes back to an earlier chapter (resume scenario)', () => {
    const { db } = setup();
    chapterRepo.insert(db, chapterRow(3, 1, 3));
    positionRepo.record(db, id(1), { chapterId: id(3), sentenceIdx: 5, positionMs: 12_000 }, T0);
    positionRepo.record(db, id(1), { chapterId: id(2), sentenceIdx: 1, positionMs: 2000 }, T0 + 1);

    const back = positionRepo.record(
      db,
      id(1),
      { chapterId: id(1), sentenceIdx: 0, positionMs: 0 },
      T0 + 2,
    );

    expect(back.furthest).toMatchObject({ chapterId: id(3), sentenceIdx: 5 });
    expect(chapterPositionRepo.get(db, id(3))).toMatchObject({
      sentenceIdx: 5,
      positionMs: 12_000,
    });
  });

  it('keeps each chapter at its own place when the listener switches between chapters', () => {
    const { db } = setup();
    positionRepo.record(db, id(1), { chapterId: id(1), sentenceIdx: 4, positionMs: 8000 }, T0);
    positionRepo.record(db, id(1), { chapterId: id(2), sentenceIdx: 1, positionMs: 2000 }, T0 + 1);

    expect(chapterPositionRepo.get(db, id(1))).toMatchObject({ sentenceIdx: 4, positionMs: 8000 });
    expect(chapterPositionRepo.get(db, id(2))).toMatchObject({ sentenceIdx: 1, positionMs: 2000 });
    expect(positionRepo.get(db, id(1))?.current).toMatchObject({
      chapterId: id(2),
      sentenceIdx: 1,
    });
  });

  it('advances the furthest position within the same chapter', () => {
    const { db } = setup();
    positionRepo.record(db, id(1), { chapterId: id(1), sentenceIdx: 4, positionMs: 0 }, T0);

    const position = positionRepo.record(
      db,
      id(1),
      { chapterId: id(1), sentenceIdx: 9, positionMs: 0 },
      T0 + 1,
    );

    expect(position.furthest.sentenceIdx).toBe(9);
    expect(positionRepo.get(db, id(1))).toEqual(position);
  });

  it('rejects a chapter from another series and reads the order from the database', () => {
    const { db } = setup();
    seriesRepo.insert(db, seriesRow(2));
    chapterRepo.insert(db, chapterRow(9, 2, 1));

    expect(() =>
      positionRepo.record(db, id(1), { chapterId: id(9), sentenceIdx: 0, positionMs: 0 }, T0),
    ).toThrow(/not in series/);
  });
});
