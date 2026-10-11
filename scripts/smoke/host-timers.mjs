// Virtual-clock timers for the boot harness. React Native in bridgeless mode installs timers as host
// functions from C++, so the harness provides them. Time only advances when the driver drains the
// queue, which makes a boot deterministic and fast.

/**
 * @typedef {{ due: number, fn: () => void, interval: number | null }} Timer
 */

export function createHostTimers() {
  let now = 0;
  let nextId = 1;
  /** @type {Map<number, Timer>} */
  const timers = new Map();

  /**
   * @param {(...args: unknown[]) => void} fn
   * @param {number} delay
   * @param {unknown[]} args
   * @param {boolean} repeat
   */
  const schedule = (fn, delay, args, repeat) => {
    const id = nextId++;
    const ms = Number.isFinite(delay) && delay > 0 ? delay : 0;
    const callback = () => fn(...args);
    timers.set(id, { due: now + ms, fn: callback, interval: repeat ? Math.max(ms, 1) : null });
    return id;
  };

  /** Runs the earliest due timer, advancing virtual time, until the window is exhausted. */
  /**
   * @param {number} windowMs
   * @param {(error: unknown) => void} onError
   */
  const drain = async (windowMs, onError) => {
    const deadline = now + windowMs;
    for (;;) {
      await new Promise((resolve) => setImmediate(resolve));
      let next = null;
      for (const [id, timer] of timers) {
        if (timer.due <= deadline && (next === null || timer.due < next.timer.due)) {
          next = { id, timer };
        }
      }
      if (next === null) {
        return;
      }
      now = Math.max(now, next.timer.due);
      if (next.timer.interval === null) {
        timers.delete(next.id);
      } else {
        next.timer.due = now + next.timer.interval;
      }
      try {
        next.timer.fn();
      } catch (error) {
        onError(error);
      }
    }
  };

  return {
    now: () => now,
    pending: () => timers.size,
    drain,
    setTimeout: (
      /** @type {(...args: unknown[]) => void} */ fn,
      /** @type {number | undefined} */ delay,
      /** @type {unknown[]} */ ...args
    ) => schedule(fn, delay ?? 0, args, false),
    setInterval: (
      /** @type {(...args: unknown[]) => void} */ fn,
      /** @type {number | undefined} */ delay,
      /** @type {unknown[]} */ ...args
    ) => schedule(fn, delay ?? 0, args, true),
    clearTimeout: (/** @type {number} */ id) => {
      timers.delete(id);
    },
    requestAnimationFrame: (/** @type {(time: number) => void} */ fn) =>
      schedule(() => fn(now), 16, [], false),
  };
}
