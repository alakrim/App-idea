/*
 * The text and the progress bar of the foreground notification, as pure functions of the chapter's
 * progress. `describeStep` repeats the words of the chapter row's status line (features/chapter/
 * chapter-status.ts). A parity test in features/pipeline keeps the two in step.
 */
import type { Stage } from '@/core/domain';
import type { ChapterProgress, StageProgress } from '@/features/pipeline/facade';

export interface ForegroundProgress {
  readonly value: number;
  readonly max: number;
  /** True when the stage gives no measure yet, so the bar shows motion instead of a value. */
  readonly indeterminate: boolean;
}

export interface ForegroundNotification {
  readonly title: string;
  readonly text: string;
  readonly progress: ForegroundProgress;
}

export const NOTIFICATION_FALLBACK_TITLE = 'Lectio';
export const QUEUED_TEXT = 'Queued…';
export const RECONNECTING_TEXT = 'Reconnecting…';

const STAGE_VERBS: Readonly<Record<Stage, string>> = {
  extract: 'Extracting',
  clean: 'Cleaning',
  segment: 'Splitting',
  analyze: 'Analyzing',
  translate: 'Translating',
  narrate: 'Narrating',
};

const INDETERMINATE: ForegroundProgress = { value: 0, max: 100, indeterminate: true };

function stepDetail(stage: StageProgress): string {
  const { passages } = stage;
  if (passages !== null && passages.total > 0) {
    return `passage ${Math.min(passages.done + 1, passages.total)} of ${passages.total}`;
  }
  return `${Math.round(stage.progress * 100)}%`;
}

/** "Narrating · passage 5 of 18", the same line the chapter row shows, without the elapsed time. */
export function describeStep(progress: ChapterProgress | null): string {
  if (progress?.reconnecting) return RECONNECTING_TEXT;
  const active = progress?.stages.find((stage) => stage.status === 'running');
  if (!active) return QUEUED_TEXT;
  return `${STAGE_VERBS[active.stage]} · ${stepDetail(active)}`;
}

/**
 * The stage's progress: passages done of the total for a narration stage, otherwise the stage's
 * percentage. Indeterminate when nothing runs or the running stage has no measure yet.
 */
export function progressOf(progress: ChapterProgress | null): ForegroundProgress {
  const active = progress?.stages.find((stage) => stage.status === 'running');
  if (!active) return INDETERMINATE;
  if (active.passages !== null && active.passages.total > 0) {
    return {
      value: Math.min(active.passages.done, active.passages.total),
      max: active.passages.total,
      indeterminate: false,
    };
  }
  if (active.progress > 0) {
    return {
      value: Math.round(Math.min(1, active.progress) * 100),
      max: 100,
      indeterminate: false,
    };
  }
  return INDETERMINATE;
}

export function notificationOf(input: {
  readonly title: string | null;
  readonly progress: ChapterProgress | null;
}): ForegroundNotification {
  return {
    title: input.title ?? NOTIFICATION_FALLBACK_TITLE,
    text: describeStep(input.progress),
    progress: progressOf(input.progress),
  };
}
