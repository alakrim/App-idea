import type { Job } from '@/core/domain';
import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { stageActivityRepo } from '@/db/repos/stage-activity-repo';
import { narrationProfiles } from '@/db/schema';

import { checkRecentChapters } from './checks-pipeline';
import {
  parseRecentChapters,
  RECENT_CHAPTER_LIMIT,
  stageSeconds,
  summarizeRecentChapter,
} from './recent-chapters';

function job(stage: Job['stage'], overrides: Partial<Job> = {}): Job {
  return {
    id: id(1),
    chapterId: id(1),
    stage,
    status: 'done',
    attempt: 1,
    inputHash: 'hash',
    model: null,
    promptVersion: null,
    progress: 1,
    error: null,
    costUsd: 0,
    startedAt: T0,
    finishedAt: T0 + 12_400,
    ...overrides,
  };
}

const CHAPTER = { id: id(1), title: 'The Lamp', status: 'ready' as const };

describe('stageSeconds', () => {
  it('is the time from start to finish, to a tenth of a second', () => {
    expect(stageSeconds(job('narrate', { startedAt: T0, finishedAt: T0 + 12_449 }))).toBe(12.4);
  });

  it('is null while the job runs, when it never started, or when its clock runs backwards', () => {
    expect(stageSeconds(job('narrate', { status: 'running', finishedAt: null }))).toBeNull();
    expect(stageSeconds(job('narrate', { startedAt: null }))).toBeNull();
    expect(stageSeconds(job('narrate', { startedAt: T0 + 5, finishedAt: T0 }))).toBeNull();
  });
});

describe('summarizeRecentChapter', () => {
  it('lists every run stage in order, marking the stages with no job as not run', () => {
    const summary = summarizeRecentChapter({
      chapter: CHAPTER,
      jobs: [job('narrate', { startedAt: T0, finishedAt: T0 + 30_000 }), job('extract')],
      segments: [],
      activity: [],
    });

    expect(summary.stages.map((s) => s.stage)).toEqual([
      'extract',
      'segment',
      'analyze',
      'translate',
      'narrate',
    ]);
    expect(summary.stages[1]).toEqual({
      stage: 'segment',
      status: 'not run',
      seconds: null,
      lastActivityAt: null,
      stallCount: 0,
      staleAbortCount: 0,
    });
    expect(summary.stages[4]).toMatchObject({ stage: 'narrate', status: 'done', seconds: 30 });
  });

  it('carries each stage’s last activity and its stall and stale-abort counts', () => {
    const summary = summarizeRecentChapter({
      chapter: CHAPTER,
      jobs: [job('narrate', { startedAt: T0, finishedAt: T0 + 30_000 })],
      segments: [],
      activity: [
        { stage: 'narrate', lastActivityAt: T0 + 29_000, stallCount: 2, staleAbortCount: 1 },
      ],
    });

    expect(summary.stages[4]).toEqual({
      stage: 'narrate',
      status: 'done',
      seconds: 30,
      lastActivityAt: T0 + 29_000,
      stallCount: 2,
      staleAbortCount: 1,
    });
    expect(summary.stages[0]).toMatchObject({ lastActivityAt: null, stallCount: 0 });
  });

  it('reports the passage count and the audio seconds, summed from the stored passages', () => {
    const summary = summarizeRecentChapter({
      chapter: CHAPTER,
      jobs: [],
      segments: [{ durationMs: 12_000 }, { durationMs: 40_250 }, { durationMs: 3_000 }],
      activity: [],
    });

    expect(summary).toMatchObject({
      chapterId: id(1),
      title: 'The Lamp',
      chapterStatus: 'ready',
      segmentCount: 3,
      audioSeconds: 55.3,
    });
  });
});

describe('parseRecentChapters', () => {
  it('reads the chapters back from the probe values', () => {
    const summary = summarizeRecentChapter({
      chapter: CHAPTER,
      jobs: [job('extract')],
      segments: [],
      activity: [],
    });
    expect(parseRecentChapters({ chapters: [summary] })).toEqual([summary]);
  });

  it('returns no chapters for values that do not match the schema', () => {
    expect(parseRecentChapters({ chapters: 'nope' })).toEqual([]);
    expect(parseRecentChapters({})).toEqual([]);
  });
});

describe('checkRecentChapters', () => {
  function setup() {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1, { title: 'The Lamp', status: 'ready' }));
    chapterRepo.insert(db, chapterRow(2, 1, 2, { title: 'The Bell', status: 'failed' }));
    db.insert(narrationProfiles)
      .values({
        id: id(900),
        name: 'Voice',
        provider: 'openrouter',
        model: 'test/model',
        voice: 'alloy',
        style: null,
        speed: 1,
      })
      .run();
    jobRepo.upsert(db, job('extract', { chapterId: id(1), id: id(11) }));
    jobRepo.upsert(
      db,
      job('narrate', {
        chapterId: id(1),
        id: id(12),
        startedAt: T0 + 1_000,
        finishedAt: T0 + 31_000,
      }),
    );
    jobRepo.upsert(
      db,
      job('narrate', {
        chapterId: id(2),
        id: id(13),
        status: 'failed',
        startedAt: T0 + 50_000,
        finishedAt: T0 + 52_000,
      }),
    );
    audioSegmentRepo.insert(db, {
      id: id(21),
      chapterId: id(1),
      idx: 0,
      sentenceStart: 0,
      sentenceEnd: 1,
      fileUri: 'file:///a.wav',
      durationMs: 9_000,
      sentenceOffsetsMs: [0, 4_000],
      profileId: id(900),
      inputHash: 'h',
    });
    return db;
  }

  it('lists the recent chapters with their stage timings and audio', () => {
    const db = setup();

    const outcome = checkRecentChapters(db);

    expect(outcome.status).toBe('pass');
    const chapters = parseRecentChapters(outcome.values);
    expect(chapters.map((c) => c.title)).toEqual(['The Bell', 'The Lamp']);
    const lamp = chapters.find((c) => c.title === 'The Lamp');
    expect(lamp?.segmentCount).toBe(1);
    expect(lamp?.audioSeconds).toBe(9);
    expect(lamp?.stages.find((s) => s.stage === 'narrate')).toMatchObject({
      stage: 'narrate',
      status: 'done',
      seconds: 30,
    });
    const bell = chapters.find((c) => c.title === 'The Bell');
    expect(bell?.stages.find((s) => s.stage === 'narrate')).toMatchObject({
      stage: 'narrate',
      status: 'failed',
      seconds: 2,
    });
  });

  it('reports the live activity the pipeline recorded for each stage', () => {
    const db = setup();
    stageActivityRepo.startStage(db, id(1), 'narrate', T0 + 1_000);
    stageActivityRepo.countStall(db, id(1), 'narrate', T0 + 20_000);
    stageActivityRepo.countStaleAbort(db, id(1), 'narrate', T0 + 21_000);
    stageActivityRepo.touch(db, id(1), 'narrate', T0 + 30_000);

    const chapters = parseRecentChapters(checkRecentChapters(db).values);
    const narrate = chapters
      .find((c) => c.title === 'The Lamp')
      ?.stages.find((s) => s.stage === 'narrate');

    expect(narrate).toMatchObject({
      lastActivityAt: T0 + 30_000,
      stallCount: 1,
      staleAbortCount: 1,
    });
  });

  it('passes with an empty list when no chapter has run', () => {
    const { db } = createTestDb();
    expect(checkRecentChapters(db)).toEqual({ status: 'pass', values: { chapters: [] } });
  });

  it('lists at most the recent-chapter limit, the most recently active first', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    for (let n = 1; n <= RECENT_CHAPTER_LIMIT + 1; n += 1) {
      chapterRepo.insert(db, chapterRow(n, 1, n, { title: `Chapter ${n}` }));
      jobRepo.upsert(
        db,
        job('extract', { id: id(100 + n), chapterId: id(n), finishedAt: T0 + n * 1_000 }),
      );
    }

    const titles = parseRecentChapters(checkRecentChapters(db).values).map((c) => c.title);

    expect(titles).toEqual(['Chapter 6', 'Chapter 5', 'Chapter 4', 'Chapter 3', 'Chapter 2']);
  });
});
