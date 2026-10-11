import {
  END_OF_CHAPTER_SLEEP_TIMER,
  SLEEP_FADE_MS,
  SLEEP_TIMER_OFF,
  minutesSleepTimer,
  sleepPhase,
} from './sleep-timer';

describe('minutesSleepTimer', () => {
  it('ends the given number of minutes after now', () => {
    expect(minutesSleepTimer(1_000, 30)).toEqual({ mode: 'minutes', endsAt: 1_000 + 30 * 60_000 });
  });

  it('rejects minutes outside 1 to 240 and fractional values', () => {
    expect(() => minutesSleepTimer(0, 0)).toThrow(RangeError);
    expect(() => minutesSleepTimer(0, 241)).toThrow(RangeError);
    expect(() => minutesSleepTimer(0, 2.5)).toThrow(RangeError);
  });
});

describe('sleepPhase for a minutes timer', () => {
  const timer = minutesSleepTimer(0, 1);
  const end = 60_000;

  it('is idle until the end time', () => {
    expect(sleepPhase(timer, end - 1, null)).toEqual({ kind: 'idle' });
  });

  it('fades the master linearly over ten seconds from the end time', () => {
    expect(sleepPhase(timer, end, null)).toEqual({ kind: 'fading', gain: 1 });
    const half = sleepPhase(timer, end + SLEEP_FADE_MS / 2, null);
    expect(half).toEqual({ kind: 'fading', gain: 0.5 });
  });

  it('pauses once the fade is complete', () => {
    expect(sleepPhase(timer, end + SLEEP_FADE_MS, null)).toEqual({ kind: 'pause' });
    expect(sleepPhase(timer, end + SLEEP_FADE_MS + 5_000, null)).toEqual({ kind: 'pause' });
  });
});

describe('sleepPhase for an end-of-chapter timer', () => {
  it('stays idle while the chapter length is unknown (progressive playback)', () => {
    expect(sleepPhase(END_OF_CHAPTER_SLEEP_TIMER, 0, null)).toEqual({ kind: 'idle' });
  });

  it('is idle until ten seconds remain, then fades to the end', () => {
    expect(sleepPhase(END_OF_CHAPTER_SLEEP_TIMER, 0, 15_000)).toEqual({ kind: 'idle' });
    expect(sleepPhase(END_OF_CHAPTER_SLEEP_TIMER, 0, 5_000)).toEqual({ kind: 'fading', gain: 0.5 });
    expect(sleepPhase(END_OF_CHAPTER_SLEEP_TIMER, 0, 0)).toEqual({ kind: 'pause' });
  });
});

describe('off', () => {
  it('never acts', () => {
    expect(sleepPhase(SLEEP_TIMER_OFF, 1e12, 0)).toEqual({ kind: 'idle' });
  });
});
