import { useMemo, type ReactNode } from 'react';

import { useOpenRouter } from '@/app-shell/openrouter-provider';
import { newId } from '@/core/domain';
import { useDb } from '@/db/hooks';
import { settingsStore } from '@/features/settings/settings-store';

import { VocabActionsContext, createVocabActions, type VocabActions } from './vocab-actions';

export interface VocabActionsProviderProps {
  children: ReactNode;
  /** Test seam. The app leaves it out and gets actions wired to the database and OpenRouter. */
  actions?: VocabActions;
}

/** Mount once, under the database and OpenRouter providers. */
export function VocabActionsProvider({ children, actions }: VocabActionsProviderProps) {
  const db = useDb();
  const openrouter = useOpenRouter();
  const wired = useMemo(
    () =>
      actions ??
      createVocabActions({
        db,
        openrouter,
        getSettings: settingsStore.getSettings,
        now: Date.now,
        newId,
      }),
    [actions, db, openrouter],
  );
  return <VocabActionsContext.Provider value={wired}>{children}</VocabActionsContext.Provider>;
}
