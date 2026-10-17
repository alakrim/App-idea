import { createThrottledTask } from './throttled-task';

import type { TimerPort } from './throttled-task';

/** A clock and timers the test moves by hand. */
function manualClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const port: TimerPort = {
    set: (run, delayMs) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: now + delayMs, run });
      return id;
    },
    clear: (handle) => {
      timers.delete(handle as number);
    },
  };
  return {
    port,
    now: () => now,
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.run();
        }
      }
    },
    pending: () => timers.size,
  };
}

describe('createThrottledTask', () => {
  it('runs a first request at once, and a request inside the interval at its end', () => {
    const clock = manualClock();
    const run = jest.fn();
    const task = createThrottledTask({
      intervalMs: 2_000,
      now: clock.now,
      timers: clock.port,
      run,
    });

    task.request();
    expect(run).toHaveBeenCalledTimes(1);

    clock.advance(500);
    task.request();
    expect(run).toHaveBeenCalledTimes(1);

    clock.advance(1_500);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never runs twice inside one interval, however often it is asked', () => {
    const clock = manualClock();
    const run = jest.fn();
    const task = createThrottledTask({
      intervalMs: 2_000,
      now: clock.now,
      timers: clock.port,
      run,
    });

    task.request();
    for (let i = 0; i < 50; i += 1) {
      clock.advance(10);
      task.request();
    }
    clock.advance(2_000);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs again at once when the interval has already passed', () => {
    const clock = manualClock();
    const run = jest.fn();
    const task = createThrottledTask({
      intervalMs: 2_000,
      now: clock.now,
      timers: clock.port,
      run,
    });

    task.request();
    clock.advance(5_000);
    task.request();

    expect(run).toHaveBeenCalledTimes(2);
    expect(clock.pending()).toBe(0);
  });

  it('drops a scheduled run on cancel', () => {
    const clock = manualClock();
    const run = jest.fn();
    const task = createThrottledTask({
      intervalMs: 2_000,
      now: clock.now,
      timers: clock.port,
      run,
    });

    task.request();
    task.request();
    task.cancel();
    clock.advance(10_000);

    expect(run).toHaveBeenCalledTimes(1);
    expect(clock.pending()).toBe(0);
  });
});
