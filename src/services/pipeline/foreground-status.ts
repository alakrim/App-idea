/*
 * The state of the Android processing service (brief BG1, ADR-0007) as the pipeline sees it. The
 * background controller writes it, and the queue reads `keepsAlive()` so its stall watchdog keeps
 * counting while the service runs. Nothing here touches the platform.
 */

/** 'unsupported' where there is no service. Otherwise the service is stopped, starting or running. */
export type ForegroundServiceState = 'unsupported' | 'stopped' | 'starting' | 'running';

export interface ForegroundStatusStore {
  get(): ForegroundServiceState;
  set(next: ForegroundServiceState): void;
  /** True while the service is starting or running, so the JS runtime is kept alive. */
  keepsAlive(): boolean;
  /** Calls the listener after each change. Returns the unsubscribe function. */
  subscribe(listener: (state: ForegroundServiceState) => void): () => void;
}

export function createForegroundStatus(supported: boolean): ForegroundStatusStore {
  let current: ForegroundServiceState = supported ? 'stopped' : 'unsupported';
  const listeners = new Set<(state: ForegroundServiceState) => void>();
  return {
    get: () => current,
    set(next) {
      if (next === current) return;
      current = next;
      for (const listener of listeners) listener(current);
    },
    keepsAlive: () => current === 'starting' || current === 'running',
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
