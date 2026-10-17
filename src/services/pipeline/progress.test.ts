import type { Stage } from '@/core/domain';
import type { PipelineEvent } from '@/core/pipeline/context';

import {
  emptyTracked,
  overallProgress,
  reduceEvent,
  startRun,
  STAGE_WEIGHTS,
  toChapterProgress,
} from './progress';

import type { StatusLookup, TrackedChapter } from './progress';

const ID = '01J0000000000000000000CHAP';
const NONE: StatusLookup = () => null;

function run(events: PipelineEvent[], lookup: StatusLookup = NONE, start = emptyTracked()) {
  return events.reduce<TrackedChapter>((state, event) => reduceEvent(state, event, lookup), start);
}

type Status = 'running' | 'done' | 'skipped' | 'failed' | 'cancelled';
const stage = (s: Stage, status: Status): PipelineEvent => ({
  type: 'stage',
  chapterId: ID,
  stage: s,
  status,
});

describe('waiting chapters', () => {
  it('shows the retry time only in the waiting state', () => {
    const failed = run([stage('extract', 'failed')]);
    expect(toChapterProgress(ID, failed, 'waiting', 90_000).retryAt).toBe(90_000);
    expect(toChapterProgress(ID, failed, 'failed', 90_000).retryAt).toBeNull();
  });

  it('keeps the failure that made it wait, and its stage, so the stepper stays honest', () => {
    const error = { code: 'NETWORK' as const, message: 'No connection.', retryable: true };
    const tracked = run([
      stage('analyze', 'running'),
      stage('analyze', 'failed'),
      {
        type: 'error',
        chapterId: ID,
        stage: 'analyze',
        error,
      },
      { type: 'retrying', chapterId: ID, attempt: 1, retryAt: 90_000 },
    ]);
    const progress = toChapterProgress(ID, tracked, 'waiting', 90_000);
    expect(progress.state).toBe('waiting');
    expect(progress.error).toEqual(error);
    expect(progress.stages.find((s) => s.stage === 'analyze')?.status).toBe('failed');
  });
});

describe('STAGE_WEIGHTS', () => {
  it('add up to 1, as the brief sets them', () => {
    const total = Object.values(STAGE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('overallProgress', () => {
  it('is zero before anything runs and one when every stage is done', () => {
    expect(overallProgress(emptyTracked().stages)).toBe(0);
    const all = run(
      (['extract', 'clean', 'segment', 'analyze', 'translate', 'narrate'] as const).map((s) =>
        stage(s, 'done'),
      ),
    );
    expect(overallProgress(all.stages)).toBeCloseTo(1, 10);
  });

  it('leaves skipped stages out of the denominator, so a chapter without translation still reaches 1', () => {
    const done = run([
      stage('extract', 'done'),
      stage('clean', 'skipped'),
      stage('segment', 'done'),
      stage('analyze', 'done'),
      stage('translate', 'skipped'),
      stage('narrate', 'done'),
    ]);
    expect(overallProgress(done.stages)).toBeCloseTo(1, 10);
  });

  it('weights a stage by its share, so half of narration is 0.2', () => {
    const half = run([
      stage('extract', 'done'),
      stage('clean', 'skipped'),
      stage('segment', 'done'),
      stage('analyze', 'done'),
      stage('translate', 'skipped'),
      stage('narrate', 'running'),
      { type: 'progress', chapterId: ID, stage: 'narrate', progress: 0.5 },
    ]);
    const denominator = 1 - STAGE_WEIGHTS.clean - STAGE_WEIGHTS.translate;
    const numerator =
      STAGE_WEIGHTS.extract +
      STAGE_WEIGHTS.segment +
      STAGE_WEIGHTS.analyze +
      0.5 * STAGE_WEIGHTS.narrate;
    expect(overallProgress(half.stages)).toBeCloseTo(numerator / denominator, 10);
  });
});

describe('reduceEvent', () => {
  it('moves through running, done and ready, and records the segments as they arrive', () => {
    const tracked = run([
      stage('extract', 'running'),
      stage('extract', 'done'),
      {
        type: 'segmentReady',
        chapterId: ID,
        segment: { idx: 0, sentenceStart: 0, sentenceEnd: 3, durationMs: 1000, uri: 'a' },
      },
      {
        type: 'segmentReady',
        chapterId: ID,
        segment: { idx: 1, sentenceStart: 4, sentenceEnd: 6, durationMs: 900, uri: 'b' },
      },
      { type: 'done', chapterId: ID },
    ]);
    expect(tracked.state).toBe('ready');
    expect(tracked.readySegments).toBe(2);
    expect(toChapterProgress(ID, tracked).totalSegments).toBe(2);
  });

  it('reads the clean job back when extract settles, as done or skipped', () => {
    const lookup: StatusLookup = (s) => (s === 'clean' ? 'done' : null);
    const tracked = run([stage('extract', 'done')], lookup);
    expect(tracked.stages.clean.status).toBe('done');
  });

  it('shows a skipped stage as done when an earlier job for it is still good', () => {
    const lookup: StatusLookup = (s) => (s === 'extract' ? 'done' : null);
    const tracked = run([stage('extract', 'skipped')], lookup);
    expect(tracked.stages.extract.status).toBe('done');
  });

  it('never moves a stage backwards on a late progress event', () => {
    const tracked = run([
      stage('narrate', 'running'),
      { type: 'progress', chapterId: ID, stage: 'narrate', progress: 0.6 },
      { type: 'progress', chapterId: ID, stage: 'narrate', progress: 0.4 },
    ]);
    expect(tracked.stages.narrate.progress).toBe(0.6);
  });

  it('keeps the cost of the run on top of the ledger total from before it', () => {
    const start = startRun(emptyTracked(), 0.25);
    const tracked = run(
      [{ type: 'cost', chapterId: ID, stage: 'analyze', usd: 0.01, totalUsd: 0.04 }],
      NONE,
      start,
    );
    expect(toChapterProgress(ID, tracked).costUsdSoFar).toBeCloseTo(0.29, 10);
  });

  it('records a failure with its error, and does not treat cancellation as an error', () => {
    const failed = run([
      stage('analyze', 'running'),
      stage('analyze', 'failed'),
      {
        type: 'error',
        chapterId: ID,
        stage: 'analyze',
        error: { code: 'NETWORK', message: 'No connection.', retryable: true },
      },
    ]);
    expect(failed.state).toBe('failed');
    expect(failed.error?.code).toBe('NETWORK');

    const cancelled = run([
      stage('narrate', 'running'),
      stage('narrate', 'cancelled'),
      {
        type: 'error',
        chapterId: ID,
        stage: 'narrate',
        error: { code: 'CANCELLED', message: 'Cancelled.', retryable: false },
      },
    ]);
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.error).toBeNull();
  });

  it('lets the caller override the state, for chapters that are waiting in the queue', () => {
    const tracked = emptyTracked();
    expect(toChapterProgress(ID, tracked, 'queued').state).toBe('queued');
  });

  it('keeps every event of one run monotonic in overall progress', () => {
    const events: PipelineEvent[] = [
      stage('extract', 'running'),
      { type: 'progress', chapterId: ID, stage: 'extract', progress: 0.5 },
      stage('extract', 'done'),
      stage('clean', 'skipped'),
      stage('segment', 'done'),
      stage('analyze', 'running'),
      stage('analyze', 'done'),
      stage('translate', 'running'),
      { type: 'progress', chapterId: ID, stage: 'translate', progress: 0.3 },
      { type: 'progress', chapterId: ID, stage: 'translate', progress: 1 },
      stage('translate', 'done'),
      stage('narrate', 'running'),
      { type: 'progress', chapterId: ID, stage: 'narrate', progress: 0.5 },
      stage('narrate', 'done'),
      { type: 'done', chapterId: ID },
    ];
    let state = emptyTracked();
    let last = 0;
    for (const event of events) {
      state = reduceEvent(state, event, NONE);
      const overall = toChapterProgress(ID, state).overall;
      expect(overall).toBeGreaterThanOrEqual(last - 1e-12);
      last = overall;
    }
    expect(last).toBe(1);
  });
});
