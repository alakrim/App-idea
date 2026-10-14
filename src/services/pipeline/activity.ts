/*
 * What a pipeline event says about a stage's live activity, as Diagnostics keeps it. Pure, so the
 * mapping is tested without a database. The facade writes each update to the stage activity table.
 */
import type { Stage } from '@/core/domain';
import type { PipelineEvent } from '@/core/pipeline/context';

export type ActivityUpdate =
  /** The stage started running: its counts start again. */
  | { readonly kind: 'start'; readonly chapterId: string; readonly stage: Stage }
  /** The stage moved. */
  | { readonly kind: 'touch'; readonly chapterId: string; readonly stage: Stage }
  | { readonly kind: 'stall'; readonly chapterId: string; readonly stage: Stage }
  | { readonly kind: 'staleAbort'; readonly chapterId: string; readonly stage: Stage };

/** The activity update an event implies, or null when the event says nothing about a stage. */
export function activityOf(event: PipelineEvent): ActivityUpdate | null {
  switch (event.type) {
    case 'stage':
      return {
        kind: event.status === 'running' ? 'start' : 'touch',
        chapterId: event.chapterId,
        stage: event.stage,
      };
    case 'progress':
    case 'cost':
      return { kind: 'touch', chapterId: event.chapterId, stage: event.stage };
    case 'stall':
      return { kind: 'stall', chapterId: event.chapterId, stage: event.stage };
    case 'staleAbort':
      return { kind: 'staleAbort', chapterId: event.chapterId, stage: event.stage };
    default:
      return null;
  }
}
