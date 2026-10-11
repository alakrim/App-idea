import {
  SCRUB_STEP_MS,
  fractionToMs,
  msToFraction,
  scrubFraction,
  scrubSensitivity,
  scrubStep,
} from './scrub';

describe('scrubSensitivity', () => {
  it('moves the whole chapter across the track at full sensitivity near the track', () => {
    expect(scrubSensitivity(0)).toBe(1);
    expect(scrubSensitivity(-10)).toBe(1);
  });

  it('slows down as the finger moves away from the track', () => {
    expect(scrubSensitivity(60)).toBe(0.4);
    expect(scrubSensitivity(-60)).toBe(0.4);
    expect(scrubSensitivity(200)).toBe(0.15);
  });
});

describe('scrubFraction', () => {
  it('adds the drag, as a share of the track width, to the start', () => {
    expect(scrubFraction(0.25, 100, 200, 1)).toBeCloseTo(0.75);
    expect(scrubFraction(0.25, 100, 200, 0.4)).toBeCloseTo(0.45);
  });

  it('clamps to the ends of the track', () => {
    expect(scrubFraction(0.9, 500, 200, 1)).toBe(1);
    expect(scrubFraction(0.1, -500, 200, 1)).toBe(0);
  });

  it('keeps the start when the track has not been measured', () => {
    expect(scrubFraction(0.5, 100, 0, 1)).toBe(0.5);
  });
});

describe('fraction and time conversions', () => {
  it('converts both ways within a rounding millisecond', () => {
    expect(fractionToMs(0.5, 600_000)).toBe(300_000);
    expect(msToFraction(300_000, 600_000)).toBeCloseTo(0.5);
  });

  it('is safe for an empty chapter', () => {
    expect(fractionToMs(0.5, 0)).toBe(0);
    expect(msToFraction(10, 0)).toBe(0);
  });
});

describe('scrubStep', () => {
  it('changes once per 15 s step', () => {
    expect(scrubStep(SCRUB_STEP_MS - 1)).toBe(0);
    expect(scrubStep(SCRUB_STEP_MS)).toBe(1);
    expect(scrubStep(-5)).toBe(0);
  });
});
