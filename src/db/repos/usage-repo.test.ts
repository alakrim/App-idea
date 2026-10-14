import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { usageRepo } from './usage-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

import type { UsageEntry } from '../../core/domain';

const DAY = 86_400_000;

function entry(n: number, overrides: Partial<UsageEntry>): UsageEntry {
  return {
    id: id(500 + n),
    at: T0,
    chapterId: null,
    stage: 'qa',
    model: 'openai/gpt-x',
    promptTokens: 100,
    completionTokens: 20,
    audioSeconds: null,
    costUsd: 0.01,
    generationId: null,
    ...overrides,
  };
}

describe('usageRepo', () => {
  it('totals one chapter from its own rows, matching the grouped total', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    chapterRepo.insert(db, chapterRow(2, 1, 2));
    usageRepo.insert(db, entry(1, { chapterId: id(1), costUsd: 0.5 }));
    usageRepo.insert(db, entry(2, { chapterId: id(1), costUsd: 0.125 }));
    usageRepo.insert(db, entry(3, { chapterId: id(2), costUsd: 9 }));
    usageRepo.insert(db, entry(4, { chapterId: null, costUsd: 7 }));

    expect(usageRepo.totalCostForChapter(db, id(1))).toBe(0.625);
    expect(usageRepo.totalCostForChapter(db, id(1))).toBe(
      usageRepo.totalsBy(db, 'chapter').find((row) => row.key === id(1))?.costUsd,
    );
  });

  it('reports zero for a chapter with no usage', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));

    expect(usageRepo.totalCostForChapter(db, id(1))).toBe(0);
  });

  it('totals spend by UTC day, model and chapter', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    usageRepo.insert(db, entry(1, { at: T0, chapterId: id(1), costUsd: 0.5 }));
    usageRepo.insert(db, entry(2, { at: T0 + 1000, model: 'tts/voice', costUsd: 0.25 }));
    usageRepo.insert(db, entry(3, { at: T0 + DAY, chapterId: id(1), costUsd: 0.125 }));

    expect(usageRepo.totalsBy(db, 'day')).toEqual([
      { key: '2023-11-14', calls: 2, promptTokens: 200, completionTokens: 40, costUsd: 0.75 },
      { key: '2023-11-15', calls: 1, promptTokens: 100, completionTokens: 20, costUsd: 0.125 },
    ]);
    expect(usageRepo.totalsBy(db, 'model').map((t) => [t.key, t.calls])).toEqual([
      ['openai/gpt-x', 2],
      ['tts/voice', 1],
    ]);
    expect(usageRepo.totalsBy(db, 'chapter').map((t) => [t.key, t.costUsd])).toEqual([
      [null, 0.25],
      [id(1), 0.625],
    ]);
  });

  it('limits totals to a window with sinceMs', () => {
    const { db } = createTestDb();
    usageRepo.insert(db, entry(1, { at: T0, costUsd: 1 }));
    usageRepo.insert(db, entry(2, { at: T0 + DAY, costUsd: 2 }));

    const total = usageRepo.totalsBy(db, 'model', { sinceMs: T0 + 1 });

    expect(total.map((t) => t.costUsd)).toEqual([2]);
  });

  it('totals spend by pipeline stage, so the usage screen can show where money went', () => {
    const { db } = createTestDb();
    usageRepo.insert(db, entry(1, { at: T0, stage: 'analyze', costUsd: 0.5 }));
    usageRepo.insert(db, entry(2, { at: T0, stage: 'narrate', costUsd: 1.25 }));
    usageRepo.insert(db, entry(3, { at: T0 + DAY, stage: 'analyze', costUsd: 0.25 }));

    expect(usageRepo.totalsBy(db, 'stage').map((t) => [t.key, t.calls, t.costUsd])).toEqual([
      ['analyze', 2, 0.75],
      ['narrate', 1, 1.25],
    ]);
    expect(
      usageRepo.totalsBy(db, 'stage', { sinceMs: T0 + 1 }).map((t) => [t.key, t.costUsd]),
    ).toEqual([['analyze', 0.25]]);
  });
});
