import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { bytesUsedByLibrary, freeSpaceBytes } from '@/services/storage';

import { storageSummary } from './summaries';

export type StorageSummaryState = { status: 'loading' } | { status: 'ready'; text: string };

/**
 * The library's size and the free space, measured after the screen has painted and again every time
 * it comes back into focus, so the figure never shows a stale size from an earlier visit.
 */
export function useStorageSummary(): StorageSummaryState {
  const [state, setState] = useState<StorageSummaryState>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const timer = setTimeout(() => {
        const text = storageSummary(bytesUsedByLibrary().totalBytes, freeSpaceBytes());
        if (active) setState({ status: 'ready', text });
      }, 0);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, []),
  );

  return state;
}
