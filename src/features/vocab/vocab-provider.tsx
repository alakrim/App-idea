import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { newId } from '@/core/domain';
import { useDb } from '@/db/hooks';
import { settingsStore } from '@/features/settings/settings-store';

import { VocabActionsContext, createVocabActions, type VocabActions } from './vocab-actions';

import type { ReactNode } from 'react';

export interface VocabActionsProviderProps {
  children: ReactNode;
  /** Test seam. The app leaves it out and gets the shared actions wired to the database and OpenRouter. */
  actions?: VocabActions;
}

/**
 * One set of vocab actions for the whole app. It is created on first use and kept, so an explanation
 * still in flight stays tracked when the reader changes tab.
 */
let shared: VocabActions | null = null;

/** Mount under the database and OpenRouter providers. Safe to mount in more than one place. */
export function VocabActionsProvider({ children, actions }: VocabActionsProviderProps) {
  const db = useDb();
  const openrouter = useOpenRouter();
  const wired =
    actions ??
    (shared ??= createVocabActions({
      db,
      openrouter,
      getSettings: settingsStore.getSettings,
      now: Date.now,
      newId,
    }));
  return <VocabActionsContext.Provider value={wired}>{children}</VocabActionsContext.Provider>;
}
