import { DUCKING_DEFAULTS, dbToLinear, duckEnvelope } from './ducking';

describe('duckEnvelope', () => {
  const base = { duckingDb: 7, attackMs: 30, releaseMs: 550 };

  it('ducks quickly while the voice is active', () => {
    expect(duckEnvelope({ ...base, voiceActive: true })).toEqual({ gainDb: -7, rampMs: 30 });
  });

  it('releases slowly once the voice stops', () => {
    expect(duckEnvelope({ ...base, voiceActive: false })).toEqual({ gainDb: 0, rampMs: 550 });
  });

  it('uses the ADR defaults when given', () => {
    expect(DUCKING_DEFAULTS).toEqual({ duckingDb: 7, attackMs: 30, releaseMs: 550 });
    const ramp = duckEnvelope({ ...DUCKING_DEFAULTS, voiceActive: true });
    expect(ramp.rampMs).toBe(30);
    expect(ramp.gainDb).toBe(-7);
  });

  it('rejects a ducking depth outside 0 to 24 dB', () => {
    expect(() => duckEnvelope({ ...base, duckingDb: -1, voiceActive: true })).toThrow(RangeError);
    expect(() => duckEnvelope({ ...base, duckingDb: 30, voiceActive: true })).toThrow(RangeError);
    expect(() => duckEnvelope({ ...base, duckingDb: Number.NaN, voiceActive: true })).toThrow(RangeError);
  });
});

describe('dbToLinear', () => {
  it('maps 0 dB to unity and -20 dB to a tenth', () => {
    expect(dbToLinear(0)).toBe(1);
    expect(dbToLinear(-20)).toBeCloseTo(0.1, 10);
    expect(dbToLinear(-Infinity)).toBe(0);
  });
});
