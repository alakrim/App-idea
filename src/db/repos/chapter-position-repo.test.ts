import { chapterPositionRepo } from './chapter-position-repo';
import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

function setup() {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  chapterRepo.insert(testDb.db, chapterRow(2, 1, 2));
  return testDb;
}

describe('chapterPositionRepo', () => {
  it('returns null for a chapter that has never been played', () => {
    const { db } = setup();

    expect(chapterPositionRepo.get(db, id(1))).toBeNull();
  });

  it('saves the place in a chapter and reads it back', () => {
    const { db } = setup();

    chapterPositionRepo.save(db, id(1), { sentenceIdx: 4, positionMs: 9000 }, T0);

    expect(chapterPositionRepo.get(db, id(1))).toEqual({
      chapterId: id(1),
      sentenceIdx: 4,
      positionMs: 9000,
      completed: false,
      updatedAt: T0,
    });
  });

  it('keeps a finished chapter finished while the listener is still near its start', () => {
    const { db } = setup();
    chapterPositionRepo.markFinished(db, id(1), { sentenceIdx: 9, positionMs: 60_000 }, T0);

    chapterPositionRepo.save(db, id(1), { sentenceIdx: 0, positionMs: 3000 }, T0 + 1);

    expect(chapterPositionRepo.get(db, id(1))?.completed).toBe(true);
  });

  it('marks a finished chapter unfinished once it is played past 5 s', () => {
    const { db } = setup();
    chapterPositionRepo.markFinished(db, id(1), { sentenceIdx: 9, positionMs: 60_000 }, T0);

    chapterPositionRepo.save(db, id(1), { sentenceIdx: 1, positionMs: 6000 }, T0 + 1);

    expect(chapterPositionRepo.get(db, id(1))).toMatchObject({
      completed: false,
      positionMs: 6000,
    });
  });

  it('reads many chapters at once, leaving out the ones never played', () => {
    const { db } = setup();
    chapterPositionRepo.save(db, id(2), { sentenceIdx: 1, positionMs: 2000 }, T0);

    const positions = chapterPositionRepo.getMany(db, [id(1), id(2)]);

    expect([...positions.keys()]).toEqual([id(2)]);
    expect(chapterPositionRepo.getMany(db, [])).toEqual(new Map());
  });

  it('refuses to mark a chapter that does not exist as finished', () => {
    const { db } = setup();

    expect(() =>
      chapterPositionRepo.markFinished(db, id(99), { sentenceIdx: 0, positionMs: 0 }, T0),
    ).toThrow(/does not exist/);
  });
});
