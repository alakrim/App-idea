import { useCallback, useEffect, useRef, useState } from 'react';

export interface FollowPause {
  /** True while following is paused by the listener. */
  paused: boolean;
  /** Pauses following, or restarts the pause window if it is already paused. */
  pause: () => void;
}

/**
 * Pauses the text from following the narration for `pauseMs` after the listener scrolls by hand.
 * Following resumes on its own once the window closes.
 */
export function useFollowPause(pauseMs: number): FollowPause {
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    setPaused(true);
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      setPaused(false);
    }, pauseMs);
  }, [clear, pauseMs]);

  useEffect(() => clear, [clear]);

  return { paused, pause };
}
