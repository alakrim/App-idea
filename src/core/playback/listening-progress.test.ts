import { UNFINISHED_AFTER_MS, listeningProgress, nextCompleted } from './listening-progress';

describe('nextCompleted', () => {
  it('stays completed while the listener is still near the start of the chapter', () => {
    expect(nextCompleted(true, 0)).toBe(true);
    expect(nextCompleted(true, UNFINISHED_AFTER_MS)).toBe(true);
  });

  it('clears once the listener plays past 5 s', () => {
    expect(nextCompleted(true, UNFINISHED_AFTER_MS + 1)).toBe(false);
  });

  it('is never set by a save alone', () => {
    expect(nextCompleted(false, 0)).toBe(false);
  });
});

describe('listeningProgress', () => {
  it('has no bar for a chapter that was never opened or has no saved time', () => {
    expect(listeningProgress(60_000, null)).toEqual({ kind: 'unstarted' });
    expect(listeningProgress(60_000, { positionMs: 0, completed: false })).toEqual({
      kind: 'unstarted',
    });
  });

  it('reports a finished chapter whatever its saved time', () => {
    expect(listeningProgress(60_000, { positionMs: 0, completed: true })).toEqual({
      kind: 'finished',
    });
  });

  it('gives the fraction heard and the minutes left from the chapter length', () => {
    expect(listeningProgress(3_600_000, { positionMs: 900_000, completed: false })).toEqual({
      kind: 'in-progress',
      fraction: 0.25,
      remainingMs: 2_700_000,
    });
  });

  it('keeps the fraction in range and leaves the time left unknown without a length', () => {
    expect(listeningProgress(1000, { positionMs: 5000, completed: false })).toEqual({
      kind: 'in-progress',
      fraction: 1,
      remainingMs: 0,
    });
    expect(listeningProgress(null, { positionMs: 5000, completed: false })).toEqual({
      kind: 'in-progress',
      fraction: 0,
      remainingMs: null,
    });
  });
});
