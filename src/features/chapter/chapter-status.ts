import type { Chapter, PipelineError } from '@/core/domain';
import type { ChapterProgress } from '@/features/pipeline/facade';
import { STAGE_VERBS } from '@/features/pipeline/stage-verbs';
import { formatDuration } from '@/features/shared/format';

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

/** The one line under a chapter title: what it is doing, or what went wrong. */
export function statusLine(
  state: ChapterRowState,
  chapter: Chapter,
  progress: ChapterProgress | null,
  failure: PipelineError | null,
): string {
  switch (state) {
    case 'ready':
      return chapter.durationMs === null
        ? 'Ready to listen'
        : `Ready · ${formatDuration(chapter.durationMs)}`;
    case 'processing': {
      if (progress?.state === 'waiting') return 'Waiting for connection…';
      const active = progress?.stages.find((stage) => stage.status === 'running');
      const verb = active ? STAGE_VERBS[active.stage] : 'Queued';
      return active ? `${verb} · ${Math.round(active.progress * 100)}%` : `${verb}…`;
    }
    case 'failed':
      return failure?.message ?? 'Processing stopped. Try again.';
    case 'draft':
      return 'Not processed yet';
  }
}
