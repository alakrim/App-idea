import type { Chapter, PipelineError, Stage } from '@/core/domain';
import type { ChapterProgress, StageProgress } from '@/features/pipeline/facade';
import { STAGE_VERBS } from '@/features/pipeline/stage-verbs';
import { formatDuration, formatElapsed } from '@/features/shared/format';

import { failureCopy } from './failure-copy';

export type ChapterRowState = 'draft' | 'processing' | 'ready' | 'failed';

/** What the row shows: live progress wins over the stored status, which only changes at the ends. */
export function rowStateOf(chapter: Chapter, progress: ChapterProgress | null): ChapterRowState {
  if (progress?.state === 'queued' || progress?.state === 'running') return 'processing';
  // A chapter waiting for a connection is still processing: it runs again on its own.
  if (progress?.state === 'waiting') return 'processing';
  if (progress?.state === 'failed') return 'failed';
  if (progress?.state === 'ready') return 'ready';
  if (chapter.status === 'processing') return 'processing';
  return chapter.status === 'ready' || chapter.status === 'failed' ? chapter.status : 'draft';
}

/** A PDF with no selectable text. Offering OCR is the only remedy the pipeline reports for it. */
export function isScannedPdfFailure(chapter: Chapter, failure: PipelineError | null): boolean {
  return chapter.source.kind === 'pdf' && failure?.code === 'CONTENT_EMPTY';
}

/** A step that has run this long shows its elapsed time, so a slow step never looks frozen. */
export const ELAPSED_SHOWN_AFTER_MS = 30_000;

/**
 * The one line under a chapter title: what it is doing, or what went wrong. `now` is the time the
 * elapsed part of a running step is measured to.
 */
export function statusLine(
  state: ChapterRowState,
  chapter: Chapter,
  progress: ChapterProgress | null,
  failure: PipelineError | null,
  now: number,
): string {
  switch (state) {
    case 'ready':
      return chapter.durationMs === null
        ? 'Ready to listen'
        : `Ready · ${formatDuration(chapter.durationMs)}`;
    case 'processing':
      return processingLine(progress, now);
    case 'failed':
      return failureCopy(failure);
    case 'draft':
      return 'Not processed yet';
  }
}

/** "Narrating · passage 5 of 18 · 42 s", or "Reconnecting…" after the app came back. */
function processingLine(progress: ChapterProgress | null, now: number): string {
  if (progress?.state === 'waiting') return 'Waiting for connection…';
  if (progress?.reconnecting) return 'Reconnecting…';
  const active = progress?.stages.find((stage) => stage.status === 'running');
  if (!active) return 'Queued…';
  return `${STAGE_VERBS[active.stage]} · ${stepDetail(active)}${elapsedSuffix(active, now)}`;
}

function stepDetail(stage: StageProgress): string {
  const { passages } = stage;
  if (passages !== null && passages.total > 0) {
    return `passage ${Math.min(passages.done + 1, passages.total)} of ${passages.total}`;
  }
  return `${Math.round(stage.progress * 100)}%`;
}

function elapsedSuffix(stage: StageProgress, now: number): string {
  if (stage.since === null) return '';
  const elapsed = now - stage.since;
  return elapsed < ELAPSED_SHOWN_AFTER_MS ? '' : ` · ${formatElapsed(elapsed)}`;
}

/** Why Play is off, in plain words, so a disabled button never leaves the listener guessing. */
export function playBlockedCopy(state: ChapterRowState): string | null {
  switch (state) {
    case 'ready':
      return null;
    case 'processing':
      return 'Play starts when preparing finishes.';
    case 'draft':
      return 'Prepare the chapter first, then play it.';
    case 'failed':
      return 'Try again to finish preparing it, then play it.';
  }
}
