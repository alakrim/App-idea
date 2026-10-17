import type { AmbienceCue } from '@/core/domain';

import { cueRangeLabel } from './ambience-range';

function cue(startSentence: number, endSentence: number): AmbienceCue {
  return {
    id: 'c',
    chapterId: 'ch',
    category: 'rain_on_roof',
    startSentence,
    endSentence,
    intensity: 'medium',
    fadeInMs: 0,
    fadeOutMs: 0,
    confidence: 1,
    reason: '',
    enabled: true,
  } as AmbienceCue;
}

describe('cueRangeLabel', () => {
  it('places a cue by where its middle falls in the chapter', () => {
    expect(cueRangeLabel(cue(2, 4), 90)).toBe('Near the start');
    expect(cueRangeLabel(cue(40, 50), 90)).toBe('Near the middle');
    expect(cueRangeLabel(cue(80, 88), 90)).toBe('Near the end');
  });

  it('falls back to the start when the chapter has no sentences to measure', () => {
    expect(cueRangeLabel(cue(10, 12), 0)).toBe('Near the start');
  });
});
