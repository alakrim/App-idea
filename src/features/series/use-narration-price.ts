import { useEffect, useState } from 'react';

import { LATIN_CHARS_PER_WORD } from '@/core/pipeline/estimate';
import { usePipeline } from '@/features/pipeline/facade';
import { narrationUsd } from '@/features/shared/estimate-price';

/** What re-narrating a chapter costs. `unknown` means the price cannot be shown, not that it is free. */
export type NarrationPrice =
  { kind: 'loading' } | { kind: 'priced'; usd: number } | { kind: 'unknown' };

/** The chapter a narration price is for, or null when no chapter is being re-generated. */
export interface NarrationTarget {
  wordCount: number | null;
  sourceLang: string | null;
  targetLang: string | null;
}

/** Prices the narration of a chapter from its word count. Null target means nothing is being priced. */
export function useNarrationPrice(target: NarrationTarget | null): NarrationPrice {
  const pipeline = usePipeline();
  const active = target !== null;
  const wordCount = target?.wordCount ?? null;
  const sourceLang = target?.sourceLang ?? null;
  const targetLang = target?.targetLang ?? null;
  const key = `${active}|${wordCount}|${sourceLang}|${targetLang}`;
  const [settled, setSettled] = useState<{ key: string; price: NarrationPrice } | null>(null);

  useEffect(() => {
    if (!active || wordCount === null) return undefined;
    let current = true;
    pipeline
      .estimate({
        chars: Math.round(wordCount * LATIN_CHARS_PER_WORD),
        sourceLang,
        targetLang,
      })
      .then((estimate) => {
        const usd = narrationUsd(estimate);
        if (current) {
          setSettled({ key, price: usd === null ? { kind: 'unknown' } : { kind: 'priced', usd } });
        }
      })
      .catch(() => {
        if (current) setSettled({ key, price: { kind: 'unknown' } });
      });
    return () => {
      current = false;
    };
  }, [pipeline, key, active, wordCount, sourceLang, targetLang]);

  if (!active) return { kind: 'loading' };
  if (wordCount === null) return { kind: 'unknown' };
  return settled?.key === key ? settled.price : { kind: 'loading' };
}
