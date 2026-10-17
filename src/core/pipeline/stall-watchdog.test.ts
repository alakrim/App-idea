import { MAX_STALLS, STALL_AFTER_MS, StallWatchdog } from './stall-watchdog';

const SPEECH_TIMEOUT_MS = 180_000;

/** A watchdog on the fake timers' clock, with its stalls recorded. */
function setup() {
  const stalls: number[] = [];
  const watchdog = new StallWatchdog({ now: () => Date.now(), onStall: (n) => stalls.push(n) });
  return { watchdog, stalls };
}

describe('StallWatchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires after 90 seconds of quiet when no request is in flight', () => {
    const { watchdog, stalls } = setup();
    watchdog.start();

    jest.advanceTimersByTime(STALL_AFTER_MS - 1);
    expect(stalls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(stalls).toEqual([1]);
  });

  it('allows the timeout of the request in flight on top of the 90 seconds', () => {
    const { watchdog, stalls } = setup();
    watchdog.start();
    watchdog.touch(SPEECH_TIMEOUT_MS);

    jest.advanceTimersByTime(STALL_AFTER_MS + SPEECH_TIMEOUT_MS - 1);
    expect(stalls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(stalls).toEqual([1]);
  });

  it('starts the quiet time again on every activity', () => {
    const { watchdog, stalls } = setup();
    watchdog.start();
    jest.advanceTimersByTime(60_000);
    watchdog.touch();
    jest.advanceTimersByTime(60_000);
    expect(stalls).toEqual([]);
    jest.advanceTimersByTime(30_000);
    expect(stalls).toEqual([1]);
  });

  it('reports each stall once, then waits a full quiet time for the next', () => {
    const { watchdog, stalls } = setup();
    watchdog.start();

    jest.advanceTimersByTime(STALL_AFTER_MS);
    expect(stalls).toEqual([1]);
    jest.advanceTimersByTime(STALL_AFTER_MS - 1);
    expect(stalls).toEqual([1]);
    jest.advanceTimersByTime(1);
    expect(stalls).toEqual([1, 2]);
  });

  it('keeps counting until stopped, and never counts past MAX_STALLS on its own', () => {
    const { watchdog, stalls } = setup();
    watchdog.start();
    jest.advanceTimersByTime(STALL_AFTER_MS * (MAX_STALLS + 1));
    expect(stalls).toEqual([1, 2, 3, 4]);

    watchdog.stop();
    jest.advanceTimersByTime(STALL_AFTER_MS * 5);
    expect(stalls).toEqual([1, 2, 3, 4]);
  });

  it('counts nothing while suspended, and starts the quiet time again on resume', () => {
    const { watchdog, stalls } = setup();
    watchdog.start();
    jest.advanceTimersByTime(60_000);
    watchdog.suspend();
    jest.advanceTimersByTime(10 * 60_000);
    expect(stalls).toEqual([]);

    watchdog.resume();
    jest.advanceTimersByTime(STALL_AFTER_MS - 1);
    expect(stalls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(stalls).toEqual([1]);
  });

  it('re-arms for the rest of the wait when the timer fires late', () => {
    let clock = 0;
    const stalls: number[] = [];
    const watchdog = new StallWatchdog({ now: () => clock, onStall: (n) => stalls.push(n) });
    watchdog.start();

    // The clock moved on without the timer firing on time, as after a frozen process.
    clock = STALL_AFTER_MS - 5_000;
    jest.advanceTimersByTime(STALL_AFTER_MS);
    expect(stalls).toEqual([]);
    clock = STALL_AFTER_MS;
    jest.advanceTimersByTime(5_000);
    expect(stalls).toEqual([1]);
  });

  it('does nothing before it is started', () => {
    const { stalls } = setup();
    jest.advanceTimersByTime(10 * STALL_AFTER_MS);
    expect(stalls).toEqual([]);
  });
});
