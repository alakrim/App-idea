import { router } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';

import { useDb } from '@/db/hooks';
import { vocabRepo } from '@/db/repos/vocab-repo';
import { useDbRead } from '@/features/shared/use-db-read';
import { selectionHaptic, impactHaptic } from '@/ui/haptics';
import { useToast } from '@/ui/toast';

import { grade, reveal, startReview, currentId, type ReviewState, type Verdict } from './review';
import { ReviewView } from './review-view';
import { useVocabActions } from './vocab-actions';
import { readReviewCards, readVocabGroups, readVocabTotal, VOCAB_TABLES } from './vocab-data';
import { VocabView } from './vocab-view';

import type { ReviewCard } from './vocab-data';

/** Container for the Vocab tab. Holds the search text and the review session, and writes to the database. */
export function VocabScreen() {
  const db = useDb();
  const actions = useVocabActions();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const groups = useDbRead(readVocabGroups, VOCAB_TABLES, query);
  const total = useDbRead(readVocabTotal, VOCAB_TABLES, '');

  const [session, setSession] = useState<{ state: ReviewState; cards: ReviewCard[] } | null>(null);

  // `version` changes whenever a pending state or failure changes, which re-renders the cards.

  // Re-render whenever a pending state or failure changes. The snapshot itself is read below.
  useSyncExternalStore(actions.subscribe, actions.getVersion);
  const explanationOf = useCallback(
    (id: string) => ({ pending: actions.isPending(id), failure: actions.failureOf(id) }),
    [actions],
  );

  const startSession = (): void => {
    const cards = readReviewCards(db);
    setSession({ state: startReview(cards.map((card) => card.id)), cards });
  };

  const grader = (verdict: Verdict): void => {
    if (session === null) return;
    const outcome = grade(session.state, verdict);
    if (outcome.graded) {
      vocabRepo.setReviewed(db, outcome.graded.id, verdict === 'known', Date.now());
      selectionHaptic();
    }
    setSession({ ...session, state: outcome.state });
  };

  if (session !== null) {
    const id = currentId(session.state);
    const card = session.cards.find((c) => c.id === id) ?? null;
    return (
      <ReviewView
        card={card}
        state={session.state}
        started={session.cards.length}
        onReveal={() => setSession({ ...session, state: reveal(session.state) })}
        onGrade={grader}
        onClose={() => setSession(null)}
        onBackToList={() => setSession(null)}
      />
    );
  }

  return (
    <VocabView
      groups={groups}
      query={query}
      total={total}
      onQueryChange={setQuery}
      onStartReview={startSession}
      onOpenLibrary={() => router.navigate('/')}
      onOpenSource={(chapterId, sentenceIdx) =>
        router.push({
          pathname: '/chapter/[chapterId]',
          params: { chapterId, sentence: String(sentenceIdx) },
        })
      }
      onDelete={(id) => {
        vocabRepo.delete(db, id);
        impactHaptic();
        toast.show({ message: 'Removed from Vocab' });
      }}
      onRetry={(id) => actions.retryExplanation(id)}
      explanationOf={explanationOf}
    />
  );
}
