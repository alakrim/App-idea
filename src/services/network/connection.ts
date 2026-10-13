/*
 * The connection, as the requests and the pipeline see it. Leaving the foreground starts a new
 * epoch. Returning to the foreground retires every request that began in an earlier epoch: on a
 * phone the socket of such a request is dead, and waiting for the request's own timeout would
 * leave the chapter idle for minutes. A retired request is retried at once by its caller. A
 * request begun after the app left the foreground is in the new epoch, so it is left alone.
 *
 * The app feeds it AppState changes. Nothing here touches React Native, so it runs in Node tests.
 */
import type { NetworkEvent, NetworkPort } from '@/core/pipeline/ports';

export interface AttemptHooks {
  /** How long the attempt may run before the caller times it out. Reported to the pipeline. */
  readonly timeoutMs: number;
  /** Aborts the attempt. The caller then retries it, or reports it. */
  readonly retire: () => void;
}

export interface Connection extends NetworkPort {
  /** Feeds the app's state. Anything but 'active' counts as away from the foreground. */
  setAppState(state: string): void;
  /** Registers an attempt. Returns the function that unregisters it once it has settled. */
  register(hooks: AttemptHooks): () => void;
}

interface Entry {
  readonly epoch: number;
  readonly retire: () => void;
}

export function createConnection(): Connection {
  let epoch = 0;
  let foreground = true;
  const inFlight = new Set<Entry>();
  const listeners = new Set<(event: NetworkEvent) => void>();

  const emit = (event: NetworkEvent): void => {
    for (const listener of listeners) listener(event);
  };

  /** Retires the attempts that match. Each is removed before it is aborted, so it is retired once. */
  const retireWhere = (matches: (entry: Entry) => boolean): number => {
    let count = 0;
    for (const entry of [...inFlight]) {
      if (!matches(entry)) continue;
      inFlight.delete(entry);
      entry.retire();
      emit({ type: 'staleAbort' });
      count += 1;
    }
    return count;
  };

  return {
    setAppState(state) {
      const nowForeground = state === 'active';
      if (nowForeground === foreground) return;
      foreground = nowForeground;
      if (!nowForeground) {
        epoch += 1;
        emit({ type: 'backgrounded' });
        return;
      }
      retireWhere((entry) => entry.epoch < epoch);
      emit({ type: 'resumed' });
    },

    register({ timeoutMs, retire }) {
      const entry: Entry = { epoch, retire };
      inFlight.add(entry);
      emit({ type: 'attempt', timeoutMs });
      return () => {
        inFlight.delete(entry);
      };
    },

    retireInFlight() {
      return retireWhere(() => true);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
