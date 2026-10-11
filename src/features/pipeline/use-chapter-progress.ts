import { useEffect, useMemo, useState } from 'react';

import { usePipeline, type ChapterProgress } from './facade';

/** Live progress for a set of chapters, keyed by chapter id. Chapters without a snapshot are absent. */
export function useChapterProgressMap(
  chapterIds: readonly string[],
): Record<string, ChapterProgress> {
  const pipeline = usePipeline();
  const [progress, setProgress] = useState<Record<string, ChapterProgress>>({});
  const key = chapterIds.join(',');
  const ids = useMemo(() => (key === '' ? [] : key.split(',')), [key]);

  useEffect(() => {
    const unsubscribers = ids.map((chapterId) =>
      pipeline.subscribe(chapterId, (snapshot) => {
        setProgress((current) => ({ ...current, [chapterId]: snapshot }));
      }),
    );
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [pipeline, ids]);

  return progress;
}
