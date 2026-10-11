import { useEffect, useState } from 'react';

import type { Series } from '@/core/domain';
import { usePipeline } from '@/features/pipeline/facade';

import { OCR_QUOTE_CHARS } from './series-data';

/** OCR cost estimate per scanned chapter. Recomputed when the set of scanned chapters changes. */
export function useOcrPrices(
  chapterIds: readonly string[],
  series: Series | null,
): Readonly<Record<string, number>> {
  const pipeline = usePipeline();
  const [prices, setPrices] = useState<Readonly<Record<string, number>>>({});
  const key = chapterIds.join(',');
  const sourceLang = series?.sourceLang ?? null;
  const targetLang = series?.targetLang ?? null;

  useEffect(() => {
    let active = true;
    const ids = key === '' ? [] : key.split(',');
    void Promise.all(
      ids.map(async (chapterId) => {
        const estimate = await pipeline.estimate({
          chars: OCR_QUOTE_CHARS,
          sourceLang,
          targetLang,
        });
        return [chapterId, estimate.totalUsd] as const;
      }),
    ).then((entries) => {
      if (active) setPrices(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [pipeline, key, sourceLang, targetLang]);

  return prices;
}
