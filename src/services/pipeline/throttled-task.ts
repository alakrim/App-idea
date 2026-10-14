/*
 * Runs a task at most once per interval. A request that comes inside the interval is not dropped:
 * one run is scheduled for the end of it, and that run reads the latest state when it fires. So the
 * last state is always shown, and the task never runs more often than the interval. Pure: the clock
 * and the timers are injected.
 */

export interface TimerPort {
  set(run: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface ThrottledTaskDeps {
  readonly intervalMs: number;
  readonly now: () => number;
  readonly timers: TimerPort;
  readonly run: () => void;
}

export interface ThrottledTask {
  /** Asks for a run. It happens now, or at the end of the interval. */
  request(): void;
  /** Drops a scheduled run. A later request starts again. */
  cancel(): void;
}

export function createThrottledTask(deps: ThrottledTaskDeps): ThrottledTask {
  let lastRunAt: number | null = null;
  let handle: unknown = null;
  let scheduled = false;

  const fire = (): void => {
    scheduled = false;
    handle = null;
    lastRunAt = deps.now();
    deps.run();
  };

  return {
    request() {
      if (scheduled) return;
      const wait = lastRunAt === null ? 0 : lastRunAt + deps.intervalMs - deps.now();
      if (wait <= 0) {
        fire();
        return;
      }
      scheduled = true;
      handle = deps.timers.set(fire, wait);
    },
    cancel() {
      if (scheduled) deps.timers.clear(handle);
      scheduled = false;
      handle = null;
    },
  };
}
