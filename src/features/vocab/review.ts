export type Verdict = 'known' | 'again';

/** An item marked "Again" comes back this many times in one session, then drops out. */
export const MAX_AGAIN_ROUNDS = 3;

/**
 * Flashcard session. `queue[0]` is the card on screen. "Known" removes it. "Again" moves it to the
 * back, so it returns later in the same session, and stops returning after MAX_AGAIN_ROUNDS.
 * Every session ends, because each card can only be re-queued a bounded number of times.
 */
export interface ReviewState {
  readonly queue: readonly string[];
  readonly revealed: boolean;
  /** The latest verdict per item, in the order each item was first graded. */
  readonly results: ReadonlyMap<string, Verdict>;
  readonly againRounds: ReadonlyMap<string, number>;
}

export interface GradeOutcome {
  readonly state: ReviewState;
  /** The verdict that was recorded, or null when there was no card to grade. */
  readonly graded: { readonly id: string; readonly verdict: Verdict } | null;
}

export function startReview(ids: readonly string[]): ReviewState {
  return { queue: [...ids], revealed: false, results: new Map(), againRounds: new Map() };
}

export function currentId(state: ReviewState): string | null {
  return state.queue[0] ?? null;
}

export function isFinished(state: ReviewState): boolean {
  return state.queue.length === 0;
}

/** Shows the answer side of the current card. Does nothing once the session has ended. */
export function reveal(state: ReviewState): ReviewState {
  if (isFinished(state) || state.revealed) return state;
  return { ...state, revealed: true };
}

export function grade(state: ReviewState, verdict: Verdict): GradeOutcome {
  const id = currentId(state);
  if (id === null) return { state, graded: null };

  const rest = state.queue.slice(1);
  const rounds = (state.againRounds.get(id) ?? 0) + (verdict === 'again' ? 1 : 0);
  const comesBack = verdict === 'again' && rounds <= MAX_AGAIN_ROUNDS;

  const results = new Map(state.results).set(id, verdict);
  const againRounds = new Map(state.againRounds);
  if (verdict === 'again') againRounds.set(id, rounds);

  return {
    state: {
      queue: comesBack ? [...rest, id] : rest,
      revealed: false,
      results,
      againRounds,
    },
    graded: { id, verdict },
  };
}

export interface ReviewSummary {
  readonly known: number;
  readonly again: number;
}

export function summarize(state: ReviewState): ReviewSummary {
  let known = 0;
  let again = 0;
  for (const verdict of state.results.values()) {
    if (verdict === 'known') known += 1;
    else again += 1;
  }
  return { known, again };
}
