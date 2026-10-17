/*
 * Decides which chapter to announce as "Ready to listen". A chapter is announced once per run, and
 * only while the app is in the foreground. The announcement ends the run's memory: a later run of
 * the same chapter (after a retry) is announced again. Pure, so the rule is tested without a runtime.
 */
import type { PipelineEvent } from '@/core/pipeline/context';

export interface PlayableAnnouncer {
  /** The chapter to announce for this event, or null. */
  handle(event: PipelineEvent, foreground: boolean): string | null;
}

export function createPlayableAnnouncer(): PlayableAnnouncer {
  const announced = new Set<string>();
  return {
    handle(event, foreground) {
      if (event.type === 'done' || event.type === 'error') {
        // The run is over: a later run may announce the chapter again.
        announced.delete(event.chapterId);
        return null;
      }
      if (event.type !== 'playable') return null;
      if (!foreground || announced.has(event.chapterId)) return null;
      announced.add(event.chapterId);
      return event.chapterId;
    },
  };
}
