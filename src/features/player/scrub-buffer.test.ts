import { clampToBuffer, fractionToMs, msToFraction, scrubFraction } from './scrub';

const MIN = 60_000;

describe('buffer band', () => {
  it('draws the generated audio as its share of the estimated track', () => {
    // 12 minutes made of an estimated 40.
    expect(msToFraction(12 * MIN, 40 * MIN)).toBeCloseTo(0.3, 10);
  });

  it('fills the whole track once the chapter is final', () => {
    expect(msToFraction(40 * MIN, 40 * MIN)).toBe(1);
  });

  it('is empty when nothing is made yet, and never past the track', () => {
    expect(msToFraction(0, 40 * MIN)).toBe(0);
    expect(msToFraction(50 * MIN, 40 * MIN)).toBe(1);
  });
});

describe('clampToBuffer', () => {
  it('leaves a scrub inside the band alone and does not mark it', () => {
    expect(clampToBuffer(0.2, 0.3)).toEqual({ fraction: 0.2, capped: false });
  });

  it('clamps a scrub past the band to its end and marks it, once per crossing', () => {
    expect(clampToBuffer(0.7, 0.3)).toEqual({ fraction: 0.3, capped: true });
  });

  it('does not mark a scrub that lands exactly on the end of the band', () => {
    expect(clampToBuffer(0.3, 0.3)).toEqual({ fraction: 0.3, capped: false });
  });
});

describe('a scrub over the buffer band', () => {
  it('lands on the end of the band when dragged past it, so the seek is to generated audio only', () => {
    const duration = 40 * MIN;
    const buffer = msToFraction(12 * MIN, duration);
    // Dragging the full track width from the start would reach 40 minutes.
    const dragged = scrubFraction(0, 1000, 1000, 1);
    const limited = clampToBuffer(dragged, buffer);

    expect(limited.capped).toBe(true);
    expect(fractionToMs(limited.fraction, duration)).toBe(12 * MIN);
  });
});
