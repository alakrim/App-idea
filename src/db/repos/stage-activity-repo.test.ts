import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { stageActivityRepo } from './stage-activity-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

function setup() {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  chapterRepo.insert(testDb.db, chapterRow(2, 1, 2));
  return testDb;
}

describe('stageActivityRepo', () => {
  it('records when a stage last moved, one row per stage', () => {
    const { db } = setup();

    stageActivityRepo.touch(db, id(1), 'narrate', T0);
    stageActivityRepo.touch(db, id(1), 'narrate', T0 + 5_000);

    expect(stageActivityRepo.listForChapter(db, id(1))).toEqual([
      { stage: 'narrate', lastActivityAt: T0 + 5_000, stallCount: 0, staleAbortCount: 0 },
    ]);
  });

  it('counts stalls and stale aborts, creating the row when it is not there yet', () => {
    const { db } = setup();

    stageActivityRepo.countStall(db, id(1), 'narrate', T0);
    stageActivityRepo.countStall(db, id(1), 'narrate', T0 + 1_000);
    stageActivityRepo.countStaleAbort(db, id(1), 'narrate', T0 + 2_000);

    expect(stageActivityRepo.listForChapter(db, id(1))).toEqual([
      { stage: 'narrate', lastActivityAt: T0 + 2_000, stallCount: 2, staleAbortCount: 1 },
    ]);
  });

  it('starts a stage again at zero counts when it starts running', () => {
    const { db } = setup();
    stageActivityRepo.countStall(db, id(1), 'narrate', T0);
    stageActivityRepo.countStaleAbort(db, id(1), 'narrate', T0);

    stageActivityRepo.startStage(db, id(1), 'narrate', T0 + 60_000);

    expect(stageActivityRepo.listForChapter(db, id(1))).toEqual([
      { stage: 'narrate', lastActivityAt: T0 + 60_000, stallCount: 0, staleAbortCount: 0 },
    ]);
  });

  it('keeps each chapter to its own stages', () => {
    const { db } = setup();
    stageActivityRepo.touch(db, id(1), 'extract', T0);
    stageActivityRepo.touch(db, id(2), 'analyze', T0);

    expect(stageActivityRepo.listForChapter(db, id(1)).map((row) => row.stage)).toEqual([
      'extract',
    ]);
    expect(stageActivityRepo.listForChapter(db, id(2)).map((row) => row.stage)).toEqual([
      'analyze',
    ]);
  });

  it('is removed with its chapter', () => {
    const { db, sqlite } = setup();
    stageActivityRepo.touch(db, id(1), 'extract', T0);

    sqlite.prepare('DELETE FROM chapters WHERE id = ?').run(id(1));

    expect(stageActivityRepo.listForChapter(db, id(1))).toEqual([]);
  });
});
