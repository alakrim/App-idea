/*
 * Chapter progress, as the facade shows it. Pure: the facade feeds it runner events and reads the
 * snapshots back, so every rule here is unit-tested without a database or a queue.
 *
 * Overall progress weights each stage by its typical share of a run. A skipped stage leaves the
 * denominator, so the bar still reaches 100% when translation does not run. Within one run every
 * event only moves a stage forward, so the overall value never goes down.
 *
 * The estimate (ADR-0008): the time per character of one in-flight request is averaged over the
 * synthesized segments (an exponentially weighted moving average), and divided by the requests in
 * flight. The remaining characters times that gives the ETA. It stays null until two segments have
 * been synthesized, because one sample says little about the network.
 */

import type { PipelineError, Stage } from '@/core/domain';
import type { JobStatusEvent, PipelineEvent, SegmentReady } from '@/core/pipeline/context';
import type {
  ChapterProgress,
  JobStatus,
  PassageProgress,
  StageProgress,
} from '@/features/pipeline/facade';

export const STAGE_WEIGHTS: Readonly<Record<Stage, number>> = {
  extract: 0.1,
  clean: 0.05,
  segment: 0.02,
  analyze: 0.18,
  translate: 0.25,
  narrate: 0.4,
};

export const STAGE_ORDER: readonly Stage[] = [
  'extract',
  'clean',
  'segment',
  'analyze',
  'translate',
  'narrate',
];

/** Weight of the newest sample in the seconds-per-character average. */
export const EWMA_ALPHA = 0.3;
/** Synthesized segments needed before an ETA is shown. */
export const MIN_TIMED_SEGMENTS = 2;

export interface StageSlot {
  readonly status: JobStatus;
  /** 0..1 within the stage. */
  readonly progress: number;
  /** Epoch milliseconds when the stage started running. Null unless it is running. */
  readonly since: number | null;
  /** Passages saved and in total, for a stage that narrates in passages. */
  readonly passages: PassageProgress | null;
}

/** What the player and the estimate know about one ready segment. */
export interface SegmentStat {
  readonly durationMs: number;
  /** Null for a segment read back from the database, which does not store its characters. */
  readonly chars: number | null;
}

export interface TrackedChapter {
  readonly state: ChapterProgress['state'];
  readonly stages: Readonly<Record<Stage, StageSlot>>;
  /** The first segment is saved, so the chapter can be played. */
  readonly playable: boolean;
  readonly segments: ReadonlyMap<number, SegmentStat>;
  readonly readySegments: number;
  readonly totalSegments: number | null;
  /** The characters the narration will speak, as far as they are known. Null until the first event. */
  readonly spokenChars: number | null;
  /** The EWMA of wall-clock seconds per character, per request in flight. Null until a sample. */
  readonly secondsPerChar: number | null;
  /** Synthesized segments that fed `secondsPerChar`. */
  readonly timedSegments: number;
  /** What the ledger held for this chapter before the current run started. */
  readonly costBaseUsd: number;
  /** What the current run has spent so far, as the runner reports it. */
  readonly runCostUsd: number;
  readonly error: PipelineError | null;
  /** The app came back to the foreground with this chapter running. Cleared by the next progress. */
  readonly reconnecting: boolean;
}

/** The job status a stage has in the database, or null when it has no job yet. */
export type StatusLookup = (stage: Stage) => JobStatus | null;

/** A stage slot that is not running: it has no start time and no passage count. */
function settledSlot(status: JobStatus, progress: number): StageSlot {
  return { status, progress, since: null, passages: null };
}

export function emptyStages(): Record<Stage, StageSlot> {
  return Object.fromEntries(
    STAGE_ORDER.map((stage) => [stage, settledSlot('pending', 0)]),
  ) as Record<Stage, StageSlot>;
}

export function emptyTracked(state: ChapterProgress['state'] = 'idle'): TrackedChapter {
  return {
    state,
    stages: emptyStages(),
    playable: false,
    segments: new Map(),
    readySegments: 0,
    totalSegments: null,
    spokenChars: null,
    secondsPerChar: null,
    timedSegments: 0,
    costBaseUsd: 0,
    runCostUsd: 0,
    error: null,
    reconnecting: false,
  };
}

/** Starts a run: the cost so far is the ledger total, and the run's own spend starts at zero. */
export function startRun(tracked: TrackedChapter, costBaseUsd: number): TrackedChapter {
  return {
    ...tracked,
    state: 'running',
    costBaseUsd,
    runCostUsd: 0,
    error: null,
    reconnecting: false,
  };
}

/** Overall progress from the stage weights, leaving out skipped stages. */
export function overallProgress(stages: Readonly<Record<Stage, StageSlot>>): number {
  let done = 0;
  let total = 0;
  for (const stage of STAGE_ORDER) {
    const slot = stages[stage];
    if (slot.status === 'skipped') continue;
    const weight = STAGE_WEIGHTS[stage];
    done += weight * (slot.status === 'done' ? 1 : slot.progress);
    total += weight;
  }
  return total === 0 ? 0 : done / total;
}

/** Audio that is ready, in milliseconds. */
export function narratedMsOf(segments: ReadonlyMap<number, SegmentStat>): number {
  let total = 0;
  for (const segment of segments.values()) total += segment.durationMs;
  return total;
}

/** Characters that are ready, counting only the segments whose characters are known. */
function narratedCharsOf(segments: ReadonlyMap<number, SegmentStat>): number {
  let total = 0;
  for (const segment of segments.values()) total += segment.chars ?? 0;
  return total;
}

function withStage(
  tracked: TrackedChapter,
  stage: Stage,
  slot: StageSlot,
): Record<Stage, StageSlot> {
  return { ...tracked.stages, [stage]: slot };
}

/** A skipped event is "done" when the job from an earlier run is still good, otherwise "skipped". */
function settledStatus(stage: Stage, lookup: StatusLookup): JobStatus {
  return lookup(stage) === 'done' ? 'done' : 'skipped';
}

/**
 * Folds one runner event into the chapter's tracked state. `at` is the time the event was seen.
 * Stall and stale-retry events change nothing here: Diagnostics keeps them.
 */
export function reduceEvent(
  tracked: TrackedChapter,
  event: PipelineEvent,
  lookup: StatusLookup,
  at: number,
): TrackedChapter {
  switch (event.type) {
    case 'stage':
      return reduceStage(tracked, event.stage, event.status, lookup, at);
    case 'progress': {
      const current = tracked.stages[event.stage];
      if (current.status === 'done' || current.status === 'skipped') {
        return { ...tracked, reconnecting: false };
      }
      return {
        ...tracked,
        reconnecting: false,
        stages: withStage(tracked, event.stage, {
          ...current,
          progress: Math.max(current.progress, clamp01(event.progress)),
          passages: event.passages ?? current.passages,
        }),
      };
    }
    case 'segmentReady':
      return reduceSegment(tracked, event.segment);
    case 'playable':
      return { ...tracked, playable: true };
    case 'analysisReady':
      // The analyze stage event already shows the stage done. The player reads the cues from the database.
      return tracked;
    case 'spokenChars':
      return { ...tracked, spokenChars: event.chars };
    case 'cost':
      return { ...tracked, runCostUsd: event.totalUsd };
    case 'retrying':
      // The waiting state and its time come from the queue's snapshot, so nothing changes here.
      return tracked;
    case 'error':
      return event.error.code === 'CANCELLED' ? tracked : { ...tracked, error: event.error };
    case 'done':
      return {
        ...tracked,
        state: 'ready',
        error: null,
        reconnecting: false,
        totalSegments: tracked.readySegments,
      };
    case 'reconnecting':
      return { ...tracked, reconnecting: true };
    case 'stall':
    case 'staleAbort':
      return tracked;
  }
}

function reduceStage(
  tracked: TrackedChapter,
  stage: Stage,
  status: JobStatusEvent,
  lookup: StatusLookup,
  at: number,
): TrackedChapter {
  const previous = tracked.stages[stage];
  let slot: StageSlot;
  let state = tracked.state;
  switch (status) {
    case 'running':
      slot = { status: 'running', progress: 0, since: at, passages: null };
      state = 'running';
      break;
    case 'done':
      slot = settledSlot('done', 1);
      break;
    case 'skipped':
      slot = settledSlot(settledStatus(stage, lookup), 1);
      break;
    case 'failed':
      slot = settledSlot('failed', previous.progress);
      state = 'failed';
      break;
    case 'cancelled':
      slot = settledSlot('cancelled', previous.progress);
      // A stage stopped by another stage's failure must not hide that failure.
      state = tracked.state === 'failed' ? 'failed' : 'cancelled';
      break;
  }
  let stages = withStage(tracked, stage, slot);
  // The clean job is written by the extract stage, so it is read back once extract settles.
  if (stage === 'extract' && status !== 'running') {
    const clean = lookup('clean');
    if (clean !== null) {
      stages = { ...stages, clean: settledSlot(clean, clean === 'pending' ? 0 : 1) };
    }
  }
  return { ...tracked, stages, state, reconnecting: false };
}

function reduceSegment(tracked: TrackedChapter, segment: SegmentReady): TrackedChapter {
  const segments = new Map(tracked.segments);
  segments.set(segment.idx, { durationMs: segment.durationMs, chars: segment.chars });
  const sample = secondsPerCharSample(segment);
  const secondsPerChar =
    sample === null
      ? tracked.secondsPerChar
      : tracked.secondsPerChar === null
        ? sample
        : EWMA_ALPHA * sample + (1 - EWMA_ALPHA) * tracked.secondsPerChar;
  return {
    ...tracked,
    playable: tracked.playable || segment.idx === 0,
    segments,
    readySegments: Math.max(tracked.readySegments, segment.idx + 1),
    secondsPerChar,
    timedSegments: tracked.timedSegments + (sample === null ? 0 : 1),
    reconnecting: false,
  };
}

/** Seconds per character per request in flight, from one synthesized segment. Null when not timed. */
function secondsPerCharSample(segment: SegmentReady): number | null {
  const { synthesis, chars } = segment;
  if (synthesis === null || chars <= 0 || synthesis.slots <= 0) return null;
  return synthesis.ms / 1000 / (chars * synthesis.slots);
}

/**
 * Estimated milliseconds of narration still to make, or null until the rate is known. Only the
 * characters still to make count, so it reaches zero when the chapter is fully narrated.
 */
export function etaMsOf(tracked: TrackedChapter): number | null {
  if (
    tracked.secondsPerChar === null ||
    tracked.timedSegments < MIN_TIMED_SEGMENTS ||
    tracked.spokenChars === null
  ) {
    return null;
  }
  const remaining = Math.max(0, tracked.spokenChars - narratedCharsOf(tracked.segments));
  return Math.round(remaining * tracked.secondsPerChar * 1000);
}

/** Estimated total length of the narration in milliseconds, from the rate the ready audio has. */
export function estimatedTotalMsOf(tracked: TrackedChapter): number | null {
  const narratedMs = narratedMsOf(tracked.segments);
  const chars = narratedCharsOf(tracked.segments);
  if (tracked.spokenChars === null || chars <= 0) return null;
  return Math.round((narratedMs * tracked.spokenChars) / chars);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The snapshot the UI reads. `state` and `retryAt` are supplied by the caller, because the queue
 * decides queued and waiting.
 */
export function toChapterProgress(
  chapterId: string,
  tracked: TrackedChapter,
  state: ChapterProgress['state'] = tracked.state,
  retryAt: number | null = null,
): ChapterProgress {
  const stages: StageProgress[] = STAGE_ORDER.map((stage) => {
    const slot = tracked.stages[stage];
    return {
      stage,
      status: slot.status,
      progress: slot.progress,
      since: slot.since,
      passages: slot.passages,
    };
  });
  const ready = state === 'ready';
  const narratedMs = narratedMsOf(tracked.segments);
  return {
    chapterId,
    state,
    stages,
    overall: ready ? 1 : overallProgress(tracked.stages),
    playable: tracked.playable,
    etaMs: ready ? null : etaMsOf(tracked),
    readySegments: tracked.readySegments,
    totalSegments: ready ? tracked.readySegments : tracked.totalSegments,
    narratedMs,
    estimatedTotalMs: ready ? narratedMs : estimatedTotalMsOf(tracked),
    costUsdSoFar: tracked.costBaseUsd + tracked.runCostUsd,
    error: tracked.error,
    retryAt: state === 'waiting' ? retryAt : null,
    reconnecting: !ready && tracked.reconnecting,
  };
}
