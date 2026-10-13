/*
 * The connection, as the requests and the pipeline see it. Leaving the foreground starts a new
 * epoch. Returning to the foreground retires every request that began in an earlier epoch: on a
 * phone the socket of such a request is dead, and waiting for the request's own timeout would
 * leave the chapter idle for minutes. A retired request is retried at once by its caller. A
 * request begun after the app left the foreground is in the new epoch, so it is left alone.
 *
 * A heartbeat narrows that to real freezes. When the app feeds `heartbeat()` about once a second,
 * a request is retired only if the beats stopped for longer than `freezeGapMs`, which means Android
 * froze the JS thread. A quick trip to the notification shade, or a background stretch during which
 * the foreground service kept JS running, retires nothing: those requests are alive, and retiring
 * them would pay for the same work twice. A gap seen by the heartbeat itself (a freeze while the
 * app stayed in the background) retires the requests begun before the gap at once. Without a
 * heartbeat, every return to the foreground retires the earlier epoch's requests.
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
  /** Called about once a second while JS runs. A long gap between beats means JS was frozen. */
  heartbeat(): void;
  /** Registers an attempt. Returns the function that unregisters it once it has settled. */
  register(hooks: AttemptHooks): () => void;
}

interface Entry {
  readonly epoch: number;
  readonly startedAt: number;
  readonly retire: () => void;
}

export interface ConnectionOptions {
  readonly now?: () => number;
  /** A gap between heartbeats longer than this means JS was frozen. Default 10 s. */
  readonly freezeGapMs?: number;
}

export const DEFAULT_FREEZE_GAP_MS = 10_000;

export function createConnection(options: ConnectionOptions = {}): Connection {
  const now = options.now ?? Date.now;
  const freezeGapMs = options.freezeGapMs ?? DEFAULT_FREEZE_GAP_MS;
  let epoch = 0;
  let foreground = true;
  /** The time of the last heartbeat, or null while no heartbeat source is attached. */
  let lastBeat: number | null = null;
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
      if (lastBeat === null) {
        retireWhere((entry) => entry.epoch < epoch);
      } else if (now() - lastBeat > freezeGapMs) {
        const frozenAt = lastBeat;
        retireWhere((entry) => entry.startedAt <= frozenAt);
      }
      emit({ type: 'resumed' });
    },

    heartbeat() {
      const t = now();
      if (lastBeat !== null && t - lastBeat > freezeGapMs) {
        const frozenAt = lastBeat;
        retireWhere((entry) => entry.startedAt <= frozenAt);
      }
      lastBeat = t;
    },

    register({ timeoutMs, retire }) {
      const entry: Entry = { epoch, startedAt: now(), retire };
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
