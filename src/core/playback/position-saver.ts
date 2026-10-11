export interface SaverTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PositionSaverOptions<T> {
  /** Persists one point. Injected so this module never touches the database. */
  save: (point: T) => void;
  /** Window length. Changes inside the window are coalesced into one save at its end. */
  windowMs: number;
  timers: SaverTimers;
}

export interface PositionSaver<T> {
  /** Records the latest point. The first push opens a window, and the window's end saves it. */
  push(point: T): void;
  /** Saves the pending point now, if there is one. Call on pause, ended and background. */
  flush(): void;
  /** Flushes, then stops the timer. The saver must not be used afterwards. */
  dispose(): void;
}

/**
 * Saves listening positions at most once per window. A pure debounce would never fire during
 * continuous playback, because every tick resets it. This version saves the newest point when the
 * window that started with the first unsaved change closes, and flush() saves it immediately.
 */
export function createPositionSaver<T>(options: PositionSaverOptions<T>): PositionSaver<T> {
  let pending: { point: T } | null = null;
  let handle: unknown = null;

  const cancelWindow = () => {
    if (handle !== null) {
      options.timers.clearTimeout(handle);
      handle = null;
    }
  };

  const flush = () => {
    cancelWindow();
    if (pending) {
      const { point } = pending;
      pending = null;
      options.save(point);
    }
  };

  return {
    push(point) {
      pending = { point };
      if (handle === null) {
        handle = options.timers.setTimeout(() => {
          handle = null;
          flush();
        }, options.windowMs);
      }
    },
    flush,
    dispose() {
      flush();
    },
  };
}
