import type { JobStatus, Stage } from '@/core/domain';
import type { StageProgress } from '@/features/pipeline/facade';

/**
 * The five steps listeners see. `segment` is internal, so it counts toward the Clean step: Clean is
 * only done once both of its stages are.
 */
export const STEP_IDS = ['extract', 'clean', 'analyze', 'translate', 'narrate'] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEP_LABELS: Readonly<Record<StepId, string>> = {
  extract: 'Extract',
  clean: 'Clean',
  analyze: 'Analyze',
  translate: 'Translate',
  narrate: 'Narrate',
};

export interface StepState {
  id: StepId;
  label: string;
  status: JobStatus;
  /** 0..1 within the step. */
  progress: number;
}

const STAGES_OF_STEP: Readonly<Record<StepId, readonly Stage[]>> = {
  extract: ['extract'],
  clean: ['clean', 'segment'],
  analyze: ['analyze'],
  translate: ['translate'],
  narrate: ['narrate'],
};

/** Turns per-stage progress into the five visible steps. A null snapshot means nothing has run. */
export function stepStates(stages: readonly StageProgress[] | null): StepState[] {
  return STEP_IDS.map((id) => {
    const parts = STAGES_OF_STEP[id]
      .map((stage) => stages?.find((entry) => entry.stage === stage))
      .filter((entry): entry is StageProgress => entry !== undefined);
    const { status, progress } = combine(parts);
    return { id, label: STEP_LABELS[id], status, progress };
  });
}

function combine(parts: readonly StageProgress[]): { status: JobStatus; progress: number } {
  if (parts.length === 0) return { status: 'pending', progress: 0 };
  const failed = parts.find((part) => part.status === 'failed');
  if (failed) return { status: 'failed', progress: failed.progress };
  const running = parts.filter((part) => part.status === 'running');
  if (running.length > 0) {
    const average = parts.reduce((sum, part) => sum + part.progress, 0) / parts.length;
    return { status: 'running', progress: average };
  }
  if (parts.every((part) => part.status === 'skipped')) return { status: 'skipped', progress: 1 };
  if (parts.every((part) => part.status === 'done' || part.status === 'skipped')) {
    return { status: 'done', progress: 1 };
  }
  return { status: 'pending', progress: 0 };
}

/** One spoken summary of the steps, for screen readers. */
export function describeSteps(steps: readonly StepState[]): string {
  return steps
    .map((step) => {
      switch (step.status) {
        case 'running':
          return `${step.label} ${Math.round(step.progress * 100)} percent`;
        case 'done':
          return `${step.label} done`;
        case 'failed':
          return `${step.label} failed`;
        case 'skipped':
          return `${step.label} not needed`;
        default:
          return `${step.label} waiting`;
      }
    })
    .join(', ');
}
