import { chapterRepo } from './chapter-repo';
import { jobRepo } from './job-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';
import { DbValidationError } from '../json-column';

import type { Job } from '../../core/domain';

function job(n: number, stage: Job['stage'], overrides: Partial<Job> = {}): Job {
  return {
    id: id(1000 + n),
    chapterId: id(1),
    stage,
    status: 'pending',
    attempt: 0,
    inputHash: `hash-${n}`,
    model: null,
    promptVersion: null,
    progress: 0,
    error: null,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function setup(): ReturnType<typeof createTestDb> {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  return testDb;
}

describe('jobRepo', () => {
  it('keeps one job per chapter and stage, replacing it on upsert', () => {
    const { db } = setup();
    jobRepo.upsert(db, job(1, 'extract'));

    jobRepo.upsert(
      db,
      job(2, 'extract', { status: 'done', progress: 1, costUsd: 0.002, attempt: 1 }),
    );

    expect(jobRepo.listForChapter(db, id(1))).toHaveLength(1);
    expect(jobRepo.get(db, id(1), 'extract')).toMatchObject({
      status: 'done',
      progress: 1,
      costUsd: 0.002,
      attempt: 1,
    });
    expect(jobRepo.get(db, id(1), 'clean')).toBeNull();
  });

  it('round-trips a pipeline error through its JSON column', () => {
    const { db } = setup();
    const error = {
      code: 'RATE_LIMITED' as const,
      message: 'The provider is busy. Try again in a minute.',
      detail: 'HTTP 429',
      retryable: true,
    };
    jobRepo.upsert(db, job(1, 'analyze', { status: 'failed', error }));

    expect(jobRepo.get(db, id(1), 'analyze')?.error).toEqual(error);
  });

  it('rejects a stored error that does not match the schema', () => {
    const { db, sqlite } = setup();
    jobRepo.upsert(db, job(1, 'analyze', { status: 'failed' }));
    sqlite
      .prepare(`UPDATE jobs SET error = '{"code":"BOGUS","message":"x","retryable":true}'`)
      .run();

    expect(() => jobRepo.get(db, id(1), 'analyze')).toThrow(DbValidationError);
  });

  it('cancels pending and running jobs but leaves finished ones alone', () => {
    const { db } = setup();
    jobRepo.upsert(db, job(1, 'extract', { status: 'done', finishedAt: T0 }));
    jobRepo.upsert(db, job(2, 'clean', { status: 'running', startedAt: T0 }));
    jobRepo.upsert(db, job(3, 'segment', { status: 'pending' }));

    jobRepo.cancelUnfinished(db, id(1), T0 + 5);

    expect(jobRepo.get(db, id(1), 'extract')?.status).toBe('done');
    expect(jobRepo.get(db, id(1), 'clean')).toMatchObject({
      status: 'cancelled',
      finishedAt: T0 + 5,
    });
    expect(jobRepo.get(db, id(1), 'segment')?.status).toBe('cancelled');
  });

  it('counts jobs per status, with zero for statuses that have none', () => {
    const { db } = setup();
    jobRepo.upsert(db, job(1, 'extract', { status: 'done' }));
    jobRepo.upsert(db, job(2, 'clean', { status: 'done' }));
    jobRepo.upsert(db, job(3, 'segment', { status: 'failed' }));

    expect(jobRepo.countByStatus(db)).toEqual({
      pending: 0,
      running: 0,
      done: 2,
      failed: 1,
      skipped: 0,
      cancelled: 0,
    });
  });

  it('lists the most recent failures first, up to the limit', () => {
    const { db } = setup();
    jobRepo.upsert(db, job(1, 'extract', { status: 'failed', finishedAt: T0 + 1 }));
    jobRepo.upsert(db, job(2, 'clean', { status: 'failed', finishedAt: T0 + 3 }));
    jobRepo.upsert(db, job(3, 'segment', { status: 'failed', finishedAt: T0 + 2 }));
    jobRepo.upsert(db, job(4, 'analyze', { status: 'done', finishedAt: T0 + 9 }));

    expect(jobRepo.recentFailures(db, 2).map((j) => j.stage)).toEqual(['clean', 'segment']);
  });
});

describe('jobRepo.recentChapterIds', () => {
  it('lists the chapters by their latest job activity, newest first, up to the limit', () => {
    const { db } = setup();
    chapterRepo.insert(db, chapterRow(2, 1, 2));
    chapterRepo.insert(db, chapterRow(3, 1, 3));
    jobRepo.upsert(db, job(1, 'extract', { status: 'done', startedAt: T0 + 10, finishedAt: T0 + 20 }));
    jobRepo.upsert(
      db,
      job(2, 'extract', { chapterId: id(2), status: 'done', startedAt: T0 + 50, finishedAt: T0 + 60 }),
    );
    jobRepo.upsert(
      db,
      job(3, 'narrate', { chapterId: id(2), status: 'running', startedAt: T0 + 70, finishedAt: null }),
    );
    jobRepo.upsert(db, job(4, 'extract', { chapterId: id(3), status: 'pending' }));

    expect(jobRepo.recentChapterIds(db, 5)).toEqual([id(2), id(1), id(3)].slice(0, 2).concat(id(3)).slice(0, 3));
    expect(jobRepo.recentChapterIds(db, 1)).toEqual([id(2)]);
  });
});
