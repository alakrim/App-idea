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
        segment: {
          idx: 0,
          sentenceStart: 0,
          sentenceEnd: 3,
          durationMs: 1000,
          uri: 'a',
          chars: 300,
          synthesis: null,
        },
      },
      {
        type: 'segmentReady',
        chapterId: ID,
        segment: {
          idx: 1,
          sentenceStart: 4,
          sentenceEnd: 6,
          durationMs: 900,
          uri: 'b',
          chars: 280,
          synthesis: null,
        },
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

describe('reduceEvent: playable, the ETA and the narrated audio', () => {
  type Synthesis = { readonly ms: number; readonly slots: number } | null;
  const ready = (
    idx: number,
    chars: number,
    durationMs: number,
    synthesis: Synthesis = null,
  ): PipelineEvent => ({
    type: 'segmentReady',
    chapterId: ID,
    segment: {
      idx,
      sentenceStart: idx,
      sentenceEnd: idx,
      durationMs,
      uri: `file:///${idx}.mp3`,
      chars,
      synthesis,
    },
  });
  const spoken = (chars: number): PipelineEvent => ({ type: 'spokenChars', chapterId: ID, chars });
  const progressOf = (tracked: TrackedChapter) => toChapterProgress(ID, tracked);

  it('makes the chapter playable on its first segment, and not before', () => {
    const tracked = run([ready(1, 300, 2000)]);
    expect(tracked.playable).toBe(false);
    expect(progressOf(run([ready(0, 200, 1500)])).playable).toBe(true);
    expect(progressOf(run([{ type: 'playable', chapterId: ID }])).playable).toBe(true);
  });

  it('leaves the ETA null until two segments have been synthesized', () => {
    const one = run([spoken(3000), ready(0, 500, 4000, { ms: 10_000, slots: 4 })]);
    expect(progressOf(one).etaMs).toBeNull();
    const two = run([
      spoken(3000),
      ready(0, 500, 4000, { ms: 10_000, slots: 4 }),
      ready(1, 500, 4000, { ms: 10_000, slots: 4 }),
    ]);
    expect(progressOf(two).etaMs).not.toBeNull();
  });

  it('estimates the time left as the remaining characters times seconds per character per request in flight', () => {
    // Each segment: 10 s for 500 characters with 4 requests in flight, so 0.005 s per character.
    const tracked = run([
      spoken(3000),
      ready(0, 500, 4000, { ms: 10_000, slots: 4 }),
      ready(1, 500, 4000, { ms: 10_000, slots: 4 }),
    ]);
    // 2,000 characters are left at 0.005 s each.
    expect(progressOf(tracked).etaMs).toBe(10_000);
  });

  it('averages the rate with an exponentially weighted moving average, weighting the newest at 0.3', () => {
    const tracked = run([
      spoken(3000),
      ready(0, 500, 4000, { ms: 10_000, slots: 4 }),
      ready(1, 500, 4000, { ms: 20_000, slots: 4 }),
    ]);
    // Samples: 0.005, then 0.01. The average is 0.3 * 0.01 + 0.7 * 0.005 = 0.0065.
    expect(tracked.secondsPerChar).toBeCloseTo(0.0065, 12);
    expect(progressOf(tracked).etaMs).toBe(13_000);
  });

  it('does not time a segment that was reused rather than synthesized', () => {
    const tracked = run([spoken(3000), ready(0, 500, 4000), ready(1, 500, 4000)]);
    expect(tracked.timedSegments).toBe(0);
    expect(progressOf(tracked).etaMs).toBeNull();
  });

  it('reports the narrated milliseconds, and the total they imply for the whole chapter', () => {
    const progress = progressOf(run([spoken(3000), ready(0, 1000, 10_000)]));
    expect(progress.narratedMs).toBe(10_000);
    expect(progress.estimatedTotalMs).toBe(30_000);
  });

  it('shows the final total with no ETA once the chapter is ready', () => {
    const progress = progressOf(
      run([spoken(3000), ready(0, 1000, 10_000), { type: 'done', chapterId: ID }]),
    );
    expect(progress.etaMs).toBeNull();
    expect(progress.estimatedTotalMs).toBe(10_000);
  });

  it('does not let a cancelled stage hide a failure from another stage', () => {
    const tracked = run([stage('analyze', 'failed'), stage('narrate', 'cancelled')]);
    expect(tracked.state).toBe('failed');
  });

  it('records the spoken characters and the analysis without moving any stage', () => {
    const before = run([stage('analyze', 'done')]);
    const after = run([
      stage('analyze', 'done'),
      spoken(900),
      { type: 'analysisReady', chapterId: ID },
    ]);
    expect(after.spokenChars).toBe(900);
    expect(after.stages).toEqual(before.stages);
  });

  it('shows stored audio as playable, with unknown characters, so it gives no ETA', () => {
    const seeded: TrackedChapter = {
      ...emptyTracked('idle'),
      playable: true,
      segments: new Map([[0, { durationMs: 4000, chars: null }]]),
      readySegments: 1,
    };
    const progress = progressOf(seeded);
    expect(progress.playable).toBe(true);
    expect(progress.narratedMs).toBe(4000);
    expect(progress.etaMs).toBeNull();
    expect(progress.estimatedTotalMs).toBeNull();
  });
});
