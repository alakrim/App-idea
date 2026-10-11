import { buildTimeline, type TimelineSegment } from './timeline';

/** Two segments: sentences 0-1 (4 s) and 2-3 (6 s). */
const SEGMENTS: TimelineSegment[] = [
  { durationMs: 4000, sentenceStart: 0, sentenceEnd: 1, sentenceOffsetsMs: [0, 2000] },
  { durationMs: 6000, sentenceStart: 2, sentenceEnd: 3, sentenceOffsetsMs: [0, 3000] },
];

describe('buildTimeline', () => {
  it('sums durations and counts sentences', () => {
    const timeline = buildTimeline(SEGMENTS);
    expect(timeline.totalDurationMs).toBe(10_000);
    expect(timeline.sentenceCount).toBe(4);
  });

  it('is empty for no segments', () => {
    const timeline = buildTimeline([]);
    expect(timeline.totalDurationMs).toBe(0);
    expect(timeline.sentenceCount).toBe(0);
    expect(timeline.positionToSentence(500)).toBe(-1);
    expect(() => timeline.segmentAt(0)).toThrow(RangeError);
  });

  it('rejects segments that are not contiguous from sentence 0', () => {
    expect(() =>
      buildTimeline([
        { durationMs: 1000, sentenceStart: 1, sentenceEnd: 1, sentenceOffsetsMs: [0] },
      ]),
    ).toThrow(/expected sentenceStart 0/);
    expect(() =>
      buildTimeline([
        { durationMs: 1000, sentenceStart: 0, sentenceEnd: 0, sentenceOffsetsMs: [0] },
        { durationMs: 1000, sentenceStart: 2, sentenceEnd: 2, sentenceOffsetsMs: [0] },
      ]),
    ).toThrow(/expected sentenceStart 1/);
  });

  it('rejects offset lists that do not match the sentence range or leave the segment', () => {
    expect(() =>
      buildTimeline([
        { durationMs: 1000, sentenceStart: 0, sentenceEnd: 1, sentenceOffsetsMs: [0] },
      ]),
    ).toThrow(/expected 2 sentence offsets/);
    expect(() =>
      buildTimeline([
        { durationMs: 1000, sentenceStart: 0, sentenceEnd: 1, sentenceOffsetsMs: [0, 1000] },
      ]),
    ).toThrow(/non-decreasing and inside/);
    expect(() =>
      buildTimeline([
        { durationMs: 1000, sentenceStart: 0, sentenceEnd: 1, sentenceOffsetsMs: [500, 100] },
      ]),
    ).toThrow(/non-decreasing and inside/);
  });
});

describe('positionToSentence', () => {
  const timeline = buildTimeline(SEGMENTS);

  it('maps media time to the sentence playing at that moment', () => {
    expect(timeline.positionToSentence(0)).toBe(0);
    expect(timeline.positionToSentence(1999)).toBe(0);
    expect(timeline.positionToSentence(2000)).toBe(1);
    expect(timeline.positionToSentence(3999)).toBe(1);
    expect(timeline.positionToSentence(4000)).toBe(2);
    expect(timeline.positionToSentence(7000)).toBe(3);
  });

  it('clamps out-of-range positions to the available range', () => {
    expect(timeline.positionToSentence(-50)).toBe(0);
    expect(timeline.positionToSentence(99_999)).toBe(3);
  });
});

describe('sentenceToPosition', () => {
  const timeline = buildTimeline(SEGMENTS);

  it('returns the chapter-global start of each sentence', () => {
    expect(timeline.sentenceToPosition(0)).toBe(0);
    expect(timeline.sentenceToPosition(1)).toBe(2000);
    expect(timeline.sentenceToPosition(2)).toBe(4000);
    expect(timeline.sentenceToPosition(3)).toBe(7000);
  });

  it('round-trips with positionToSentence', () => {
    for (let idx = 0; idx < timeline.sentenceCount; idx += 1) {
      expect(timeline.positionToSentence(timeline.sentenceToPosition(idx))).toBe(idx);
    }
  });

  it('throws for a sentence that is not available', () => {
    expect(() => timeline.sentenceToPosition(4)).toThrow(RangeError);
    expect(() => timeline.sentenceToPosition(-1)).toThrow(RangeError);
  });
});

describe('segmentAt and segmentStartMs', () => {
  const timeline = buildTimeline(SEGMENTS);

  it('returns the segment and its in-segment offset', () => {
    expect(timeline.segmentAt(0)).toEqual({ segmentIdx: 0, offsetInSegmentMs: 0 });
    expect(timeline.segmentAt(3500)).toEqual({ segmentIdx: 0, offsetInSegmentMs: 3500 });
    expect(timeline.segmentAt(4000)).toEqual({ segmentIdx: 1, offsetInSegmentMs: 0 });
    expect(timeline.segmentAt(9000)).toEqual({ segmentIdx: 1, offsetInSegmentMs: 5000 });
  });

  it('clamps segment lookups to the timeline', () => {
    expect(timeline.segmentAt(-1)).toEqual({ segmentIdx: 0, offsetInSegmentMs: 0 });
    expect(timeline.segmentAt(12_000)).toEqual({ segmentIdx: 1, offsetInSegmentMs: 6000 });
  });

  it('reports segment start positions and rejects unknown segments', () => {
    expect(timeline.segmentStartMs(0)).toBe(0);
    expect(timeline.segmentStartMs(1)).toBe(4000);
    expect(() => timeline.segmentStartMs(2)).toThrow(RangeError);
  });
});

describe('progressive availability', () => {
  it('only reports sentences whose segment has been appended', () => {
    const first = buildTimeline(SEGMENTS.slice(0, 1));
    expect(first.isSentenceAvailable(0)).toBe(true);
    expect(first.isSentenceAvailable(1)).toBe(true);
    expect(first.isSentenceAvailable(2)).toBe(false);
    expect(first.isSentenceAvailable(-1)).toBe(false);

    const grown = buildTimeline(SEGMENTS);
    expect(grown.isSentenceAvailable(2)).toBe(true);
    expect(grown.isSentenceAvailable(4)).toBe(false);
  });

  it('keeps the earlier timeline unchanged when a segment is appended', () => {
    const first = buildTimeline(SEGMENTS.slice(0, 1));
    buildTimeline(SEGMENTS);
    expect(first.totalDurationMs).toBe(4000);
    expect(first.sentenceCount).toBe(2);
  });
});
