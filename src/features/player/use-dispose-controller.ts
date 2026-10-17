import { useEffect } from 'react';

import type { PlaybackController } from './playback-controller';

/** Disposals waiting a turn, by controller. Shared across instances, so any remount can cancel one. */
const pendingDisposals = new WeakMap<PlaybackController, ReturnType<typeof setTimeout>>();

/**
 * Disposes the controller when its provider unmounts. React StrictMode (development) runs each
 * effect's cleanup and then its setup again, on the same controller. Disposal therefore waits a
 * turn, and the setup that follows for the same controller cancels it. Without the wait, the
 * controller and its audio engine would be disposed while the provider is still mounted.
 */
export function useDisposeController(controller: PlaybackController): void {
  useEffect(() => {
    const pending = pendingDisposals.get(controller);
    if (pending !== undefined) {
      clearTimeout(pending);
      pendingDisposals.delete(controller);
    }
    return () => {
      pendingDisposals.set(
        controller,
        setTimeout(() => {
          pendingDisposals.delete(controller);
          controller.dispose();
        }, 0),
      );
    };
  }, [controller]);
}
