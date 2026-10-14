import type { AmbienceCue } from '@/core/domain';

/**
 * Where a cue sits in the chapter, in plain words. A chapter has no timeline on this screen, so the
 * sentence numbers are replaced by the part of the chapter the cue starts in.
 */
export function cueRangeLabel(cue: AmbienceCue, sentenceCount: number): string {
  if (sentenceCount <= 0) return 'Near the start';
  const middle = (cue.startSentence + cue.endSentence) / 2;
  const share = middle / sentenceCount;
  if (share < 1 / 3) return 'Near the start';
  if (share < 2 / 3) return 'Near the middle';
  return 'Near the end';
}
