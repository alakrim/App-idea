import { DEFAULT_SETTINGS } from './defaults';
import { SettingsSchema } from './settings';

describe('ambience settings schema (P1-3)', () => {
  const ambience = SettingsSchema.shape.ambience;

  it('accepts a bed level across the whole shared range, from -40 to 0 dB', () => {
    expect(ambience.safeParse({ enabled: true, levelDb: -40, duckingDb: 7 }).success).toBe(true);
    expect(ambience.safeParse({ enabled: true, levelDb: 0, duckingDb: 7 }).success).toBe(true);
    expect(ambience.safeParse({ enabled: true, levelDb: -41, duckingDb: 7 }).success).toBe(false);
    expect(ambience.safeParse({ enabled: true, levelDb: 0.5, duckingDb: 7 }).success).toBe(false);
  });

  it('accepts ducking from 0 to 24 dB', () => {
    expect(ambience.safeParse({ enabled: true, levelDb: -22, duckingDb: 24 }).success).toBe(true);
    expect(ambience.safeParse({ enabled: true, levelDb: -22, duckingDb: 25 }).success).toBe(false);
    expect(ambience.safeParse({ enabled: true, levelDb: -22, duckingDb: -1 }).success).toBe(false);
  });

  it('defaults to the engine default of 7 dB ducking, and the default settings still parse', () => {
    expect(DEFAULT_SETTINGS.ambience.duckingDb).toBe(7);
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });
});

describe('playback settings', () => {
  const playback = SettingsSchema.shape.playback;

  it('accepts a default speed from 0.5 to 2.0 and nothing outside it', () => {
    expect(playback.safeParse({ defaultRate: 0.5 }).success).toBe(true);
    expect(playback.safeParse({ defaultRate: 2 }).success).toBe(true);
    expect(playback.safeParse({ defaultRate: 0.4 }).success).toBe(false);
    expect(playback.safeParse({ defaultRate: 2.1 }).success).toBe(false);
  });

  it('defaults to normal speed', () => {
    expect(DEFAULT_SETTINGS.playback).toEqual({ defaultRate: 1 });
  });
});
