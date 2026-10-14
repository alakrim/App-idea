/*
 * Chapter progress, as the facade shows it. Pure: the facade feeds it runner events and reads the
 * snapshots back, so every rule here is unit-tested without a database or a queue.
 *
 * Overall progress weights each stage by its typical share of a run. A skipped stage leaves the
 * denominator, so the bar still reaches 100% when translation does not run. Within one run every
 * event only moves a stage forward, so the overall value never goes down.
 */

import type { PipelineError, Stage } from '@/core/domain';
import type { PipelineEvent } from '@/core/pipeline/context';
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

export interface StageSlot {
  readonly status: JobStatus;
  /** 0..1 within the stage. */
  readonly progress: number;
  /** Epoch milliseconds when the stage started running. Null unless it is running. */
  readonly since: number | null;
  /** Passages saved and in total, for a stage that narrates in passages. */
  readonly passages: PassageProgress | null;
}

export interface TrackedChapter {
  readonly state: ChapterProgress['state'];
  readonly stages: Readonly<Record<Stage, StageSlot>>;
  readonly readySegments: number;
  readonly totalSegments: number | null;
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
    readySegments: 0,
    totalSegments: null,
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

/** Folds one runner event into the chapter's tracked state. `at` is the time the event was seen. */
export function reduceEvent(
  tracked: TrackedChapter,
  event: PipelineEvent,
  lookup: StatusLookup,
  at: number,
): TrackedChapter {
  switch (event.type) {
    case 'stage':
      return reduceStage(tracked, event, lookup, at);
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
      return {
        ...tracked,
        reconnecting: false,
        readySegments: Math.max(tracked.readySegments, event.segment.idx + 1),
      };
    case 'cost':
      return { ...tracked, runCostUsd: event.totalUsd };
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
      // Recorded in Diagnostics, not shown on the chapter.
      return tracked;
  }
}

function reduceStage(
  tracked: TrackedChapter,
  event: Extract<PipelineEvent, { type: 'stage' }>,
  lookup: StatusLookup,
  at: number,
): TrackedChapter {
  const { stage } = event;
  const previous = tracked.stages[stage];
  let slot: StageSlot;
  let state = tracked.state;
  switch (event.status) {
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
      state = 'cancelled';
      break;
  }
  let stages = withStage(tracked, stage, slot);
  // The clean job is written by the extract stage, so it is read back once extract settles.
  if (stage === 'extract' && event.status !== 'running') {
    const clean = lookup('clean');
    if (clean !== null) {
      stages = { ...stages, clean: settledSlot(clean, clean === 'pending' ? 0 : 1) };
    }
  }
  return { ...tracked, stages, state, reconnecting: false };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The snapshot the UI reads. `state` is supplied by the caller, because the queue decides queued. */
export function toChapterProgress(
  chapterId: string,
  tracked: TrackedChapter,
  state: ChapterProgress['state'] = tracked.state,
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
  return {
    chapterId,
    state,
    stages,
    overall: ready ? 1 : overallProgress(tracked.stages),
    readySegments: tracked.readySegments,
    totalSegments: ready ? tracked.readySegments : tracked.totalSegments,
    costUsdSoFar: tracked.costBaseUsd + tracked.runCostUsd,
    error: tracked.error,
    reconnecting: !ready && tracked.reconnecting,
  };
}
