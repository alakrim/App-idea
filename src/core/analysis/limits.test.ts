import { ANALYSIS_SAMPLING, CUE_LIMITS } from './limits';

/** These numbers are the ones ADR-0005 and its 2026-10-17 amendment set. Changing one needs an ADR. */
describe('cue limits (ADR-0005, amendment 2026-10-17)', () => {
  it('sets the confidence floor to 0.45', () => {
    expect(CUE_LIMITS.confidenceFloor).toBe(0.45);
  });

  it('sets the density cap to 3 cues per 1,000 words', () => {
    expect(CUE_LIMITS.maxPer1kWords).toBe(3);
  });

  it('keeps the minimum span at 3 sentences and 12 seconds', () => {
    expect(CUE_LIMITS.minSentences).toBe(3);
    expect(CUE_LIMITS.minSeconds).toBe(12);
  });

  it('keeps the 200-word floor for any cue and the two-bed overlap limit', () => {
    expect(CUE_LIMITS.minWordsForCues).toBe(200);
    expect(CUE_LIMITS.maxOverlappingBeds).toBe(2);
  });
});

describe('analysis sampling', () => {
  it('runs at temperature 0 with a fixed seed, so the same text gives the same cues', () => {
    expect(ANALYSIS_SAMPLING.temperature).toBe(0);
    expect(Number.isInteger(ANALYSIS_SAMPLING.seed)).toBe(true);
  });
});
