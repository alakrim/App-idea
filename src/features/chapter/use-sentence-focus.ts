import { useEffect, useState } from 'react';

import { HIGHLIGHT_MS, HIGHLIGHT_TICK_MS, highlightStrength } from './sentence-focus';

import type { SentenceHighlight } from './reading-text';

/**
 * Highlights one sentence after a deep link, then fades it out over HIGHLIGHT_MS. A new
 * `sentenceIdx` starts the highlight again. Returns null when no highlight is showing.
 */
export function useSentenceFocus(
  sentenceIdx: number | null,
  reduced: boolean,
): SentenceHighlight | null {
  const [run, setRun] = useState<{ sentenceIdx: number; elapsedMs: number } | null>(null);

  useEffect(() => {
    if (sentenceIdx === null) return;
    const startedAt = Date.now();
    setRun({ sentenceIdx, elapsedMs: 0 });
    const timer = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= HIGHLIGHT_MS) {
        clearInterval(timer);
        setRun(null);
        return;
      }
      setRun({ sentenceIdx, elapsedMs });
    }, HIGHLIGHT_TICK_MS);
    return () => clearInterval(timer);
  }, [sentenceIdx]);

  if (run === null) return null;
  return { sentenceIdx: run.sentenceIdx, strength: highlightStrength(run.elapsedMs, reduced) };
}
