import { useEffect, useState } from 'react';

import { HIGHLIGHT_MS, HIGHLIGHT_TICK_MS, highlightStrength } from './sentence-focus';

import type { SentenceHighlight } from './reading-text';

interface Focus {
  sentenceIdx: number;
  elapsedMs: number;
}

/**
 * Highlights one sentence after a deep link, then fades it out over HIGHLIGHT_MS. A new
 * `sentenceIdx` starts the highlight again. Returns null when no highlight is showing.
 */
export function useSentenceFocus(sentenceIdx: number | null, reduced: boolean): SentenceHighlight | null {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [seen, setSeen] = useState<number | null>(null);
  const active = focus !== null;

  // A new target starts a new highlight. Adjusting state while rendering, rather than in an effect,
  // keeps the first frame of the highlight on screen.
  if (sentenceIdx !== seen) {
    setSeen(sentenceIdx);
    setFocus(sentenceIdx === null ? null : { sentenceIdx, elapsedMs: 0 });
  }

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setFocus((current) => {
        if (current === null) return null;
        const elapsedMs = current.elapsedMs + HIGHLIGHT_TICK_MS;
        return elapsedMs >= HIGHLIGHT_MS ? null : { ...current, elapsedMs };
      });
    }, HIGHLIGHT_TICK_MS);
    return () => clearInterval(timer);
  }, [active, sentenceIdx]);

  if (focus === null) return null;
  return { sentenceIdx: focus.sentenceIdx, strength: highlightStrength(focus.elapsedMs, reduced) };
}
