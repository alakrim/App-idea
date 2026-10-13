import { createVirtualTimers } from './timers';

describe('virtual timers', () => {
  it('runs a timeout once, when the clock reaches its due time', () => {
    const timers = createVirtualTimers();
    const fired: number[] = [];
    timers.setTimeout(() => fired.push(1), 1000);

    timers.advance(999);
    expect(fired).toEqual([]);
    timers.advance(1);
    expect(fired).toEqual([1]);
    timers.advance(5000);
    expect(fired).toEqual([1]);
  });

  it('runs due timers in order, and a timer scheduled inside another lands at its own due time', () => {
    const timers = createVirtualTimers();
    const log: string[] = [];
    timers.setTimeout(() => {
      log.push('a');
      timers.setTimeout(() => log.push('c'), 300);
    }, 500);
    timers.setTimeout(() => log.push('b'), 700);

    timers.advance(600);
    expect(log).toEqual(['a']);
    timers.advance(100);
    expect(log).toEqual(['a', 'b']);
    timers.advance(100);
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('repeats an interval at its period', () => {
    const timers = createVirtualTimers();
    let ticks = 0;
    timers.setInterval(() => {
      ticks += 1;
    }, 250);

    timers.advance(999);
    expect(ticks).toBe(3);
    timers.advance(1);
    expect(ticks).toBe(4);
  });

  it('never runs a cleared timer or interval', () => {
    const timers = createVirtualTimers();
    const callback = jest.fn();
    const timeout = timers.setTimeout(callback, 100);
    const interval = timers.setInterval(callback, 100);
    timers.clearTimeout(timeout);
    timers.clearInterval(interval);

    timers.advance(1000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('stops an interval that clears itself', () => {
    const timers = createVirtualTimers();
    let handle: unknown = null;
    let ticks = 0;
    handle = timers.setInterval(() => {
      ticks += 1;
      if (ticks === 2) timers.clearInterval(handle);
    }, 100);

    timers.advance(1000);
    expect(ticks).toBe(2);
  });
});
