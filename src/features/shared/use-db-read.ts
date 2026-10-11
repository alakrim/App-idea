import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';

import { useDb } from '@/db/hooks';

import type { Db } from '@/db/types';

/**
 * Runs a synchronous read with `key` and re-runs it whenever one of `tables` changes. `read` must be
 * a stable function (module level), because it is part of the memo key. The same expo-sqlite change
 * event drives the hooks in src/db/hooks.ts. This copy serves reads that combine several repositories.
 */
export function useDbRead<K, T>(read: (db: Db, key: K) => T, tables: readonly string[], key: K): T {
  const db = useDb();
  const [revision, setRevision] = useState(0);
  const watched = tables.join(',');

  useEffect(() => {
    const names = new Set(watched.split(','));
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (names.has(tableName)) {
        setRevision((current) => current + 1);
      }
    });
    return () => subscription.remove();
  }, [watched]);

  // `revision` is the signal that a watched table changed. The read itself does not use it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(db, key), [read, db, key, revision]);
}
