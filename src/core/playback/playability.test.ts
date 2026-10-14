import { isComplete, isPlayable, playableRun } from './playability';

const passage = (idx: number, sentenceStart: number, sentenceEnd: number) => ({
  idx,
  sentenceStart,
  sentenceEnd,
});

describe('playableRun', () => {
  it('is the passages from the start that run unbroken from sentence 0', () => {
    expect(playableRun([passage(0, 0, 4), passage(1, 5, 9), passage(2, 10, 12)])).toEqual([
      passage(0, 0, 4),
      passage(1, 5, 9),
      passage(2, 10, 12),
    ]);
  });

  it('stops at a gap, so audio after a failed passage waits for the gap to be filled', () => {
    // Passage 0 failed, but 1 to 3 were paid for and saved. None of them can be heard yet.
    expect(playableRun([passage(1, 5, 9), passage(2, 10, 12), passage(3, 13, 15)])).toEqual([]);
    expect(playableRun([passage(0, 0, 4), passage(2, 10, 12)])).toEqual([passage(0, 0, 4)]);
  });

  it('stops where the sentences do not join up, for example after a passage that was re-cut', () => {
    expect(playableRun([passage(0, 0, 4), passage(1, 6, 9)])).toEqual([passage(0, 0, 4)]);
  });

  it('reads the passages in index order, whatever order they were saved in', () => {
    expect(playableRun([passage(1, 5, 9), passage(0, 0, 4)]).map((p) => p.idx)).toEqual([0, 1]);
  });
});

describe('isPlayable', () => {
  it('needs at least one passage that can be heard', () => {
    expect(isPlayable([])).toBe(false);
    expect(isPlayable([passage(0, 0, 4)])).toBe(true);
  });

  it('is false while only passages after a gap are saved', () => {
    expect(isPlayable([passage(1, 5, 9)])).toBe(false);
  });
});

describe('isComplete', () => {
  const full = [passage(0, 0, 4), passage(1, 5, 9)];

  it('is complete when narration is done and the passages cover every sentence', () => {
    expect(isComplete({ narrateDone: true, passages: full, sentenceCount: 10 })).toBe(true);
  });

  it('is not complete while narration is still running', () => {
    expect(isComplete({ narrateDone: false, passages: full, sentenceCount: 10 })).toBe(false);
  });

  it('is not complete when the passages stop short of the last sentence', () => {
    expect(isComplete({ narrateDone: true, passages: full, sentenceCount: 12 })).toBe(false);
  });

  it('is not complete when there is no text', () => {
    expect(isComplete({ narrateDone: true, passages: [], sentenceCount: 0 })).toBe(false);
  });
});
