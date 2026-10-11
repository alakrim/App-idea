import {
  currentId,
  grade,
  isFinished,
  MAX_AGAIN_ROUNDS,
  reveal,
  startReview,
  summarize,
} from './review';

describe('review session', () => {
  it('starts on the first card, hidden', () => {
    const state = startReview(['a', 'b']);

    expect(currentId(state)).toBe('a');
    expect(state.revealed).toBe(false);
    expect(isFinished(state)).toBe(false);
  });

  it('reveals the answer once and keeps it revealed', () => {
    const once = reveal(startReview(['a']));

    expect(once.revealed).toBe(true);
    expect(reveal(once)).toBe(once);
  });

  it('removes a Known card and hides the next one', () => {
    const outcome = grade(reveal(startReview(['a', 'b'])), 'known');

    expect(outcome.graded).toEqual({ id: 'a', verdict: 'known' });
    expect(currentId(outcome.state)).toBe('b');
    expect(outcome.state.revealed).toBe(false);
  });

  it('sends an Again card to the back of the session', () => {
    const outcome = grade(startReview(['a', 'b']), 'again');

    expect(currentId(outcome.state)).toBe('b');
    expect(outcome.state.queue).toEqual(['b', 'a']);
  });

  it('drops an Again card after MAX_AGAIN_ROUNDS and still finishes', () => {
    let state = startReview(['a']);
    for (let round = 0; round < MAX_AGAIN_ROUNDS; round += 1) {
      state = grade(state, 'again').state;
      expect(currentId(state)).toBe('a');
    }
    state = grade(state, 'again').state;

    expect(isFinished(state)).toBe(true);
    expect(summarize(state)).toEqual({ known: 0, again: 1 });
  });

  it('keeps the latest verdict per item, so a card later marked Known counts as known', () => {
    let state = startReview(['a', 'b']);
    state = grade(state, 'again').state;
    state = grade(state, 'known').state;

    expect(state.queue).toEqual(['a']);
    state = grade(state, 'known').state;
    expect(summarize(state)).toEqual({ known: 2, again: 0 });
  });

  it('does nothing when there is no card left to grade', () => {
    const done = grade(startReview(['a']), 'known').state;

    const outcome = grade(done, 'again');

    expect(outcome.graded).toBeNull();
    expect(outcome.state).toBe(done);
    expect(reveal(done)).toBe(done);
  });

  it('finishes a mixed session with an accurate summary', () => {
    let state = startReview(['a', 'b', 'c']);
    state = grade(state, 'known').state;
    state = grade(state, 'again').state;
    state = grade(state, 'known').state;
    state = grade(state, 'known').state;

    expect(isFinished(state)).toBe(true);
    expect(summarize(state)).toEqual({ known: 3, again: 0 });
  });
});
