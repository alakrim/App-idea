import { AHEAD_TOLERANCE_MS, isNarratingAhead, NARRATING_AHEAD_COPY } from './ahead-state';

const base = {
  playState: 'buffering',
  final: false,
  positionMs: 40_000,
  generatedMs: 40_000,
} as const;

describe('isNarratingAhead', () => {
  it('is true when playback has reached the end of the audio made so far, while narration goes on', () => {
    expect(isNarratingAhead(base)).toBe(true);
  });

  it('counts a position within the tolerance of the end, because position updates are periodic', () => {
    expect(isNarratingAhead({ ...base, positionMs: 40_000 - AHEAD_TOLERANCE_MS })).toBe(true);
  });

  it('is false in the middle of the audio, so a network stall is not reported as narrating ahead', () => {
    expect(isNarratingAhead({ ...base, positionMs: 20_000 })).toBe(false);
  });

  it('is false once the chapter is final, because the end is then the end of the chapter', () => {
    expect(isNarratingAhead({ ...base, final: true })).toBe(false);
  });

  it('is false while playing, paused or loading', () => {
    for (const playState of ['playing', 'paused', 'loading', 'ended'] as const) {
      expect(isNarratingAhead({ ...base, playState })).toBe(false);
    }
  });

  it('is false when no audio has been made yet', () => {
    expect(isNarratingAhead({ ...base, positionMs: 0, generatedMs: 0 })).toBe(false);
  });

  it('keeps the copy calm and short', () => {
    expect(NARRATING_AHEAD_COPY).toBe('Narrating ahead…');
  });
});
