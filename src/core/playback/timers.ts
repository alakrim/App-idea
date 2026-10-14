/**
 * The timer functions the playback layer schedules its work with. The player store, the audio
 * engine and the controller take one as a dependency, so tests drive time with a virtual clock.
 */
export interface TimerPort {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemTimers: TimerPort = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface VirtualTimers extends TimerPort {
  /**
   * Moves the clock forward by `ms`. Every timer that falls due runs at its own due time, in order,
   * so a timer that schedules another one still lands at the right moment.
   */
  advance(ms: number): void;
}

interface Entry {
  dueAt: number;
  everyMs: number | null;
  callback: () => void;
}

/** A clock that only moves when `advance` is called. Timers never fire on their own. */
export function createVirtualTimers(): VirtualTimers {
  let now = 0;
  let nextHandle = 1;
  const entries = new Map<number, Entry>();

  const earliestDue = (until: number): [number, Entry] | null => {
    let found: [number, Entry] | null = null;
    for (const [handle, entry] of entries) {
      if (entry.dueAt <= until && (found === null || entry.dueAt < found[1].dueAt)) {
        found = [handle, entry];
      }
    }
    return found;
  };

  const schedule = (callback: () => void, ms: number, everyMs: number | null): number => {
    const handle = nextHandle;
    nextHandle += 1;
    entries.set(handle, { dueAt: now + Math.max(0, ms), everyMs, callback });
    return handle;
  };

  return {
    setTimeout: (callback, ms) => schedule(callback, ms, null),
    clearTimeout: (handle) => {
      entries.delete(handle as number);
    },
    setInterval: (callback, ms) => schedule(callback, ms, Math.max(1, ms)),
    clearInterval: (handle) => {
      entries.delete(handle as number);
    },
    advance(ms) {
      const end = now + ms;
      for (let due = earliestDue(end); due !== null; due = earliestDue(end)) {
        const [handle, entry] = due;
        now = entry.dueAt;
        if (entry.everyMs === null) {
          entries.delete(handle);
        } else {
          entry.dueAt += entry.everyMs;
        }
        entry.callback();
      }
      now = end;
    },
  };
}
