import { useMemo } from 'react';

import { createIdGenerator } from '@/core/domain';
import { useDb } from '@/db/hooks';

import { seriesFiles } from './series-files';

import type { SeriesServiceDeps } from './series-service';

/** Dependencies for the series service, bound to the open database. */
export function useSeriesDeps(): SeriesServiceDeps {
  const db = useDb();
  return useMemo<SeriesServiceDeps>(
    () => ({ db, files: seriesFiles, newId: createIdGenerator(), now: Date.now }),
    [db],
  );
}
