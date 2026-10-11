import { sentenceAt } from '../text/timing';

/**
 * The part of an audio segment the timeline needs. Every value is media time: playback rate never
 * enters the timeline, so speed changes cannot move a sentence.
 */
export interface TimelineSegment {
  durationMs: number;
  /** Inclusive, chapter-global sentence index of the first sentence in the segment. */
  sentenceStart: number;
  /** Inclusive, chapter-global sentence index of the last sentence in the segment. */
  sentenceEnd: number;
  /** Start offset of each sentence within the segment. Length is sentenceEnd - sentenceStart + 1. */
  sentenceOffsetsMs: readonly number[];
}

export interface SegmentPosition {
  segmentIdx: number;
  offsetInSegmentMs: number;
}

export interface ChapterTimeline {
  /** Duration of the segments that are available so far, in media ms. */
  readonly totalDurationMs: number;
  /** Number of sentences available so far. Sentence indices run from 0 to sentenceCount - 1. */
  readonly sentenceCount: number;
  /** Sentence playing at `ms`, clamped to the available range. -1 when nothing is available. */
  positionToSentence(ms: number): number;
  /** Start position of an available sentence. Throws RangeError for an unavailable sentence. */
  sentenceToPosition(idx: number): number;
  /** Segment containing `ms`, clamped to the available range. Throws when the timeline is empty. */
  segmentAt(ms: number): SegmentPosition;
  /** Start position of a segment, by its index in the timeline. */
  segmentStartMs(segmentIdx: number): number;
  /** True once a segment covering the sentence has been appended (progressive playback gate). */
  isSentenceAvailable(idx: number): boolean;
}

/** Index of the last entry at or before `value`. Returns -1 when every entry is after it. */
function lastAtOrBefore(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((sorted[mid] ?? Infinity) <= value) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

function validateSegments(segments: readonly TimelineSegment[]): void {
  let expectedSentence = 0;
  segments.forEach((segment, index) => {
    const label = `segment ${index}`;
    if (!Number.isFinite(segment.durationMs) || segment.durationMs < 1) {
      throw new RangeError(`${label}: durationMs must be at least 1, got ${segment.durationMs}`);
    }
    if (segment.sentenceStart !== expectedSentence) {
      throw new RangeError(
        `${label}: expected sentenceStart ${expectedSentence}, got ${segment.sentenceStart}`,
      );
    }
    if (segment.sentenceEnd < segment.sentenceStart) {
      throw new RangeError(`${label}: sentenceEnd must be >= sentenceStart`);
    }
    const expectedOffsets = segment.sentenceEnd - segment.sentenceStart + 1;
    if (segment.sentenceOffsetsMs.length !== expectedOffsets) {
      throw new RangeError(
        `${label}: expected ${expectedOffsets} sentence offsets, got ${segment.sentenceOffsetsMs.length}`,
      );
    }
    let previous = 0;
    for (const offset of segment.sentenceOffsetsMs) {
      if (!(offset >= previous) || offset >= segment.durationMs) {
        throw new RangeError(
          `${label}: sentence offsets must be non-decreasing and inside the segment`,
        );
      }
      previous = offset;
    }
    expectedSentence = segment.sentenceEnd + 1;
  });
}

/**
 * Builds the timeline for the contiguous segments of a chapter, which start at sentence 0. The
 * timeline is immutable. For progressive playback, build a new one after each append.
 */
export function buildTimeline(segments: readonly TimelineSegment[]): ChapterTimeline {
  validateSegments(segments);

  const starts: number[] = [];
  const sentenceStarts: number[] = [];
  let total = 0;
  for (const segment of segments) {
    starts.push(total);
    sentenceStarts.push(segment.sentenceStart);
    total += segment.durationMs;
  }
  const sentenceCount = segments.length === 0 ? 0 : (segments.at(-1)?.sentenceEnd ?? -1) + 1;

  const segmentIndexAt = (ms: number): number => Math.max(0, lastAtOrBefore(starts, ms));

  return {
    totalDurationMs: total,
    sentenceCount,

    positionToSentence(ms) {
      if (segments.length === 0) return -1;
      const clamped = Math.min(Math.max(0, ms), total);
      const index = segmentIndexAt(clamped);
      const segment = segments[index];
      if (!segment) return -1;
      const offset = Math.min(clamped - (starts[index] ?? 0), segment.durationMs - 1);
      return segment.sentenceStart + sentenceAt(segment.sentenceOffsetsMs, offset);
    },

    sentenceToPosition(idx) {
      const index = lastAtOrBefore(sentenceStarts, idx);
      const segment = segments[index];
      if (!segment || idx > segment.sentenceEnd) {
        throw new RangeError(`sentence ${idx} is not available yet`);
      }
      return (starts[index] ?? 0) + (segment.sentenceOffsetsMs[idx - segment.sentenceStart] ?? 0);
    },

    segmentAt(ms) {
      if (segments.length === 0) {
        throw new RangeError('the timeline has no segments');
      }
      const clamped = Math.min(Math.max(0, ms), total);
      const segmentIdx = segmentIndexAt(clamped);
      return {
        segmentIdx,
        offsetInSegmentMs: clamped - (starts[segmentIdx] ?? 0),
      };
    },

    segmentStartMs(segmentIdx) {
      const start = starts[segmentIdx];
      if (start === undefined) {
        throw new RangeError(`segment ${segmentIdx} does not exist`);
      }
      return start;
    },

    isSentenceAvailable(idx) {
      return idx >= 0 && idx < sentenceCount;
    },
  };
}
