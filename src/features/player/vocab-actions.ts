import { createContext, useContext } from 'react';

import type { SentenceRef } from '@/core/domain';

export interface VocabActions {
  /** Saves a word or sentence the learner picked. Vocab (brief U4) provides the real store. */
  onSaveVocab(sentenceRef: SentenceRef, text: string): void;
}

/** Until the Vocab feature mounts its provider, saving is a no-op. */
export const VocabActionsContext = createContext<VocabActions>({
  onSaveVocab: () => undefined,
});

export function useVocabActions(): VocabActions {
  return useContext(VocabActionsContext);
}
