import {
  BED_LEVEL_RANGE_DB,
  DUCKING_RANGE_DB,
  PLAYBACK_RATE_RANGE,
  clampToRange,
  isInRange,
} from './ranges';

describe('playback ranges', () => {
  it('keeps the bed level range the engine and the sliders share', () => {
    expect(BED_LEVEL_RANGE_DB).toEqual({ min: -40, max: 0 });
    expect(DUCKING_RANGE_DB).toEqual({ min: 0, max: 24 });
    expect(PLAYBACK_RATE_RANGE).toEqual({ min: 0.5, max: 2 });
  });

  it('clamps a value into the range from either side', () => {
    expect(clampToRange(-60, BED_LEVEL_RANGE_DB)).toBe(-40);
    expect(clampToRange(9, BED_LEVEL_RANGE_DB)).toBe(0);
    expect(clampToRange(-22, BED_LEVEL_RANGE_DB)).toBe(-22);
  });

  it('treats the ends as inside and NaN as outside', () => {
    expect(isInRange(-40, BED_LEVEL_RANGE_DB)).toBe(true);
    expect(isInRange(0, BED_LEVEL_RANGE_DB)).toBe(true);
    expect(isInRange(0.1, BED_LEVEL_RANGE_DB)).toBe(false);
    expect(isInRange(Number.NaN, BED_LEVEL_RANGE_DB)).toBe(false);
  });
});
