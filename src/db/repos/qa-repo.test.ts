import { chapterRepo } from './chapter-repo';
import { qaRepo } from './qa-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

import type { QaMessage } from '../../core/domain';

function message(n: number, overrides: Partial<QaMessage> = {}): QaMessage {
  return {
    id: id(300 + n),
    seriesId: id(1),
    role: 'user',
    content: `Question ${n}`,
    cutoffChapterOrder: 2,
    cutoffSentenceIdx: 5,
    citations: [],
    createdAt: T0 + n,
    ...overrides,
  };
}

describe('qaRepo', () => {
  it('appends messages and lists them oldest first, with citations parsed', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    const answer = message(2, {
      role: 'assistant',
      content: 'Answer (Ch. 1).',
      citations: [{ chapterId: id(1), idx: 0 }],
    });

    qaRepo.append(db, message(1));
    qaRepo.append(db, answer);

    expect(qaRepo.listForSeries(db, id(1))).toEqual([message(1), answer]);
  });

  it('returns the latest messages when the thread is longer than the limit', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    for (let n = 1; n <= 5; n += 1) qaRepo.append(db, message(n));

    expect(qaRepo.listForSeries(db, id(1), 2).map((m) => m.content)).toEqual([
      'Question 4',
      'Question 5',
    ]);
  });

  it('keeps each series thread separate', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    seriesRepo.insert(db, seriesRow(2));
    qaRepo.append(db, message(1));
    qaRepo.append(db, message(2, { seriesId: id(2) }));

    expect(qaRepo.listForSeries(db, id(1)).map((m) => m.content)).toEqual(['Question 1']);
  });
});
