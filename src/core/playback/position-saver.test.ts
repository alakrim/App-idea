import { createPositionSaver, type SaverTimers } from './position-saver';

/** Manual timers: nothing fires until advance() moves the clock. */
function manualTimers() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const timers: SaverTimers = {
    setTimeout(callback, ms) {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, { at: now + ms, callback });
      return handle;
    },
    clearTimeout(handle) {
      pending.delete(handle as number);
    },
  };
  return {
    timers,
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        pending.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
    pendingCount: () => pending.size,
  };
}

describe('createPositionSaver', () => {
  it('does not save before the window closes', () => {
    const clock = manualTimers();
    const save = jest.fn();
    const saver = createPositionSaver({ save, windowMs: 5000, timers: clock.timers });
    saver.push({ sentence: 1 });
    clock.advance(4999);
    expect(save).not.toHaveBeenCalled();
  });

  it('saves the newest point once when the window closes, even during continuous pushes', () => {
    const clock = manualTimers();
    const save = jest.fn();
    const saver = createPositionSaver({ save, windowMs: 5000, timers: clock.timers });
    for (let i = 0; i < 20; i += 1) {
      saver.push({ sentence: i });
      clock.advance(250);
    }
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ sentence: 19 });
  });

  it('opens a new window for changes after the previous save', () => {
    const clock = manualTimers();
    const save = jest.fn();
    const saver = createPositionSaver({ save, windowMs: 5000, timers: clock.timers });
    saver.push({ sentence: 1 });
    clock.advance(5000);
    saver.push({ sentence: 9 });
    clock.advance(5000);
    expect(save.mock.calls).toEqual([[{ sentence: 1 }], [{ sentence: 9 }]]);
  });

  it('flush saves the pending point immediately and cancels the window', () => {
    const clock = manualTimers();
    const save = jest.fn();
    const saver = createPositionSaver({ save, windowMs: 5000, timers: clock.timers });
    saver.push({ sentence: 3 });
    saver.flush();
    expect(save).toHaveBeenCalledWith({ sentence: 3 });
    expect(clock.pendingCount()).toBe(0);
    clock.advance(10_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending does nothing', () => {
    const clock = manualTimers();
    const save = jest.fn();
    const saver = createPositionSaver({ save, windowMs: 5000, timers: clock.timers });
    saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('dispose flushes and leaves no timer behind', () => {
    const clock = manualTimers();
    const save = jest.fn();
    const saver = createPositionSaver({ save, windowMs: 5000, timers: clock.timers });
    saver.push({ sentence: 7 });
    saver.dispose();
    expect(save).toHaveBeenCalledWith({ sentence: 7 });
    expect(clock.pendingCount()).toBe(0);
  });
});
