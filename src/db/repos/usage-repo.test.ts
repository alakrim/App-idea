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
});
