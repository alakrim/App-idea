import type { ChapterTimeline } from '@/core/playback/timeline';

export interface MediaRange {
  /** Inclusive start, in media ms. */
  startMs: number;
  /** Exclusive end, in media ms. */
  endMs: number;
}

/**
 * The span one sentence occupies on the timeline. The last available sentence ends at the end of
 * the available audio, so a repeat still works while a chapter is narrating. Null when the sentence
 * is not available yet or has no length.
 */
export function sentenceRange(timeline: ChapterTimeline, idx: number): MediaRange | null {
  if (!timeline.isSentenceAvailable(idx)) return null;
  const startMs = timeline.sentenceToPosition(idx);
  const endMs = timeline.isSentenceAvailable(idx + 1)
    ? timeline.sentenceToPosition(idx + 1)
    : timeline.totalDurationMs;
  return endMs > startMs ? { startMs, endMs } : null;
}

export function containsMs(range: MediaRange, ms: number): boolean {
  return ms >= range.startMs && ms < range.endMs;
}
