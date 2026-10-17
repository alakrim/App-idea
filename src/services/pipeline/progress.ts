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
import type { ChapterProgress, JobStatus, StageProgress } from '@/features/pipeline/facade';

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
}

/** The job status a stage has in the database, or null when it has no job yet. */
export type StatusLookup = (stage: Stage) => JobStatus | null;

export function emptyStages(): Record<Stage, StageSlot> {
  return Object.fromEntries(
    STAGE_ORDER.map((stage) => [stage, { status: 'pending', progress: 0 }]),
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
  };
}

/** Starts a run: the cost so far is the ledger total, and the run's own spend starts at zero. */
export function startRun(tracked: TrackedChapter, costBaseUsd: number): TrackedChapter {
  return { ...tracked, state: 'running', costBaseUsd, runCostUsd: 0, error: null };
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

/** Folds one runner event into the chapter's tracked state. */
export function reduceEvent(
  tracked: TrackedChapter,
  event: PipelineEvent,
  lookup: StatusLookup,
): TrackedChapter {
  switch (event.type) {
    case 'stage': {
      const { stage } = event;
      let stages: Record<Stage, StageSlot>;
      let state = tracked.state;
      switch (event.status) {
        case 'running':
          stages = withStage(tracked, stage, { status: 'running', progress: 0 });
          state = 'running';
          break;
        case 'done':
          stages = withStage(tracked, stage, { status: 'done', progress: 1 });
          break;
        case 'skipped':
          stages = withStage(tracked, stage, { status: settledStatus(stage, lookup), progress: 1 });
          break;
        case 'failed':
          stages = withStage(tracked, stage, {
            status: 'failed',
            progress: tracked.stages[stage].progress,
          });
          state = 'failed';
          break;
        case 'cancelled':
          stages = withStage(tracked, stage, {
            status: 'cancelled',
            progress: tracked.stages[stage].progress,
          });
          state = 'cancelled';
          break;
      }
      // The clean job is written by the extract stage, so it is read back once extract settles.
      if (stage === 'extract' && event.status !== 'running') {
        const clean = lookup('clean');
        if (clean !== null) {
          stages = { ...stages, clean: { status: clean, progress: clean === 'pending' ? 0 : 1 } };
        }
      }
      return { ...tracked, stages, state };
    }
    case 'progress': {
      const current = tracked.stages[event.stage];
      if (current.status === 'done' || current.status === 'skipped') return tracked;
      return {
        ...tracked,
        stages: withStage(tracked, event.stage, {
          status: current.status,
          progress: Math.max(current.progress, clamp01(event.progress)),
        }),
      };
    }
    case 'segmentReady':
      return {
        ...tracked,
        readySegments: Math.max(tracked.readySegments, event.segment.idx + 1),
      };
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
        totalSegments: tracked.readySegments,
      };
  }
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
  const stages: StageProgress[] = STAGE_ORDER.map((stage) => ({
    stage,
    status: tracked.stages[stage].status,
    progress: tracked.stages[stage].progress,
  }));
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
    retryAt: state === 'waiting' ? retryAt : null,
  };
}
