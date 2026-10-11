import { buildTimeline } from '@/core/playback/timeline';

import { containsMs, sentenceRange } from './sentence-range';

const timeline = buildTimeline([
  { durationMs: 4000, sentenceStart: 0, sentenceEnd: 1, sentenceOffsetsMs: [0, 2000] },
  { durationMs: 6000, sentenceStart: 2, sentenceEnd: 2, sentenceOffsetsMs: [500] },
]);

describe('sentenceRange', () => {
  it('spans from a sentence start to the next sentence start', () => {
    expect(sentenceRange(timeline, 0)).toEqual({ startMs: 0, endMs: 2000 });
    expect(sentenceRange(timeline, 1)).toEqual({ startMs: 2000, endMs: 4500 });
  });

  it('ends the last available sentence at the end of the available audio', () => {
    expect(sentenceRange(timeline, 2)).toEqual({ startMs: 4500, endMs: 10_000 });
  });

  it('returns null for a sentence that is not available yet', () => {
    expect(sentenceRange(timeline, 3)).toBeNull();
  });
});

describe('containsMs', () => {
  it('includes the start and excludes the end', () => {
    const range = { startMs: 1000, endMs: 2000 };
    expect(containsMs(range, 1000)).toBe(true);
    expect(containsMs(range, 1999)).toBe(true);
    expect(containsMs(range, 2000)).toBe(false);
  });
});
