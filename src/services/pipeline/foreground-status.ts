/*
 * The state of the Android foreground service that keeps chapter preparation running in the
 * background. The runner reports into it, the queue reads `keepsAlive()` so its stall watchdog keeps
 * counting while the service runs, and Diagnostics shows it. Nothing here touches the platform.
 */

export type ForegroundServiceState = 'unsupported' | 'stopped' | 'starting' | 'running' | 'failed';

export interface ForegroundServiceStatus {
  readonly state: ForegroundServiceState;
  /** Epoch milliseconds of the last start that succeeded, or null when none has. */
  readonly lastStartedAt: number | null;
  /** Why the last start failed, while the state is 'failed'. Never includes user content. */
  readonly failure: string | null;
}

export interface ForegroundStatusStore {
  get(): ForegroundServiceStatus;
  set(next: ForegroundServiceStatus): void;
  /** True while the service is starting or running, so the JS runtime is kept alive. */
  keepsAlive(): boolean;
  /** Calls the listener after each change. Returns the unsubscribe function. */
  subscribe(listener: (status: ForegroundServiceStatus) => void): () => void;
}

export function createForegroundStatus(supported: boolean): ForegroundStatusStore {
  let current: ForegroundServiceStatus = {
    state: supported ? 'stopped' : 'unsupported',
    lastStartedAt: null,
    failure: null,
  };
  const listeners = new Set<(status: ForegroundServiceStatus) => void>();
  return {
    get: () => current,
    set(next) {
      current = next;
      for (const listener of listeners) listener(current);
    },
    keepsAlive: () => current.state === 'starting' || current.state === 'running',
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
