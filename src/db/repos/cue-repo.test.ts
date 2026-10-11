import { chapterRepo } from './chapter-repo';
import { cueRepo } from './cue-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

import type { AmbienceCue } from '../../core/domain';

function cue(n: number, startSentence: number, overrides: Partial<AmbienceCue> = {}): AmbienceCue {
  return {
    id: id(100 + n),
    chapterId: id(1),
    category: 'tavern_crowd',
    startSentence,
    endSentence: startSentence + 4,
    intensity: 'medium',
    fadeInMs: 1500,
    fadeOutMs: 2000,
    confidence: 0.8,
    reason: 'Busy room with glasses and talk.',
    enabled: true,
    ...overrides,
  };
}

function setup() {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  chapterRepo.insert(testDb.db, chapterRow(2, 1, 2));
  return testDb.db;
}

describe('cueRepo', () => {
  it('lists a chapter cues in start order and only that chapter', () => {
    const db = setup();
    cueRepo.insert(db, cue(2, 30));
    cueRepo.insert(db, cue(1, 4));
    cueRepo.insert(db, cue(3, 2, { chapterId: id(2) }));

    expect(cueRepo.listForChapter(db, id(1)).map((c) => c.startSentence)).toEqual([4, 30]);
  });

  it('persists the enabled switch across reads', () => {
    const db = setup();
    cueRepo.insert(db, cue(1, 4));

    cueRepo.setEnabled(db, id(101), false);

    expect(cueRepo.listForChapter(db, id(1))[0]?.enabled).toBe(false);
    cueRepo.setEnabled(db, id(101), true);
    expect(cueRepo.listForChapter(db, id(1))[0]?.enabled).toBe(true);
  });
});
