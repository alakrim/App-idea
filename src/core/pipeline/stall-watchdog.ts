/*
 * The stall watchdog for one chapter run. A run is stalled when nothing has happened for
 * STALL_AFTER_MS plus the timeout of the request in flight. Every pipeline event and every request
 * attempt counts as activity. The watchdog is paused while the app is in the background, because
 * the process is frozen then and nothing can be expected to move. Pure: the clock is injected, and
 * the timer is the platform's own, so a timer that fires late only re-arms for the rest of the wait.
 */
import type { PipelineError } from '../domain';

/** Quiet time before a run counts as stalled, on top of the request's own timeout. */
export const STALL_AFTER_MS = 90_000;
/** Stalls in one run before the chapter fails. */
export const MAX_STALLS = 3;

/** The failure a chapter reports when its run stalls too often. Retrying resumes where it stopped. */
export const STALLED_ERROR: PipelineError = {
  code: 'NETWORK',
  message:
    'Lectio lost its connection while preparing this chapter. Tap Retry to continue where it stopped.',
  retryable: true,
};

export interface StallWatchdogDeps {
  readonly now: () => number;
  /** Called once per stall. `stalls` counts the stalls of this run, from 1. */
  readonly onStall: (stalls: number) => void;
}

export class StallWatchdog {
  private running = false;
  private suspended = false;
  private lastActivity = 0;
  private requestTimeoutMs = 0;
  private stalls = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: StallWatchdogDeps) {}

  start(): void {
    this.running = true;
    this.stalls = 0;
    this.requestTimeoutMs = 0;
    this.touch();
  }

  /**
   * Records activity now. `requestTimeoutMs`, when given, is the timeout of the request that just
   * started, and it extends the quiet time allowed before a stall.
   */
  touch(requestTimeoutMs?: number): void {
    if (requestTimeoutMs !== undefined) this.requestTimeoutMs = requestTimeoutMs;
    this.lastActivity = this.deps.now();
    this.arm();
  }

  /** The app left the foreground. Nothing counts as a stall until `resume`. */
  suspend(): void {
    this.suspended = true;
    this.clear();
  }

  /** The app returned to the foreground. The quiet time starts again from now. */
  resume(): void {
    this.suspended = false;
    this.touch();
  }

  stop(): void {
    this.running = false;
    this.clear();
  }

  private deadline(): number {
    return this.lastActivity + STALL_AFTER_MS + this.requestTimeoutMs;
  }

  private arm(): void {
    this.clear();
    if (!this.running || this.suspended) return;
    this.timer = setTimeout(() => this.check(), Math.max(0, this.deadline() - this.deps.now()));
  }

  private check(): void {
    this.timer = null;
    if (!this.running || this.suspended) return;
    if (this.deps.now() < this.deadline()) {
      this.arm();
      return;
    }
    this.stalls += 1;
    this.lastActivity = this.deps.now();
    this.deps.onStall(this.stalls);
    this.arm();
  }

  private clear(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
