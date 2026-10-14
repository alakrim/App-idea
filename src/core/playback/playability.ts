/*
 * What a chapter can play, worked out from its saved passages rather than from its status. The
 * status moves on at the ends of a run, so it cannot say whether audio that is already saved can be
 * heard. A passage is saved with its sentence range, and only the passages that run unbroken from the
 * first sentence can be played, because the timeline needs every sentence in order.
 */

/** The sentence range of one saved passage, and its place in the chapter's passage order. */
export interface PassageSpan {
  readonly idx: number;
  readonly sentenceStart: number;
  readonly sentenceEnd: number;
}

/**
 * The passages a listener can hear: the unbroken run that starts at passage 0 and at sentence 0. A
 * gap (a failed passage that a later one follows) ends the run, so audio after it waits until the
 * gap is filled. The saved audio itself is kept.
 */
export function playableRun<T extends PassageSpan>(passages: readonly T[]): T[] {
  const ordered = [...passages].sort((a, b) => a.idx - b.idx);
  const run: T[] = [];
  let nextSentence = 0;
  for (const passage of ordered) {
    if (passage.idx !== run.length || passage.sentenceStart !== nextSentence) break;
    run.push(passage);
    nextSentence = passage.sentenceEnd + 1;
  }
  return run;
}

/**
 * A chapter is playable when at least one passage can be heard. A renarration keeps the saved
 * passages until new ones replace them, so the chapter stays playable while the run is in progress.
 */
export function isPlayable(passages: readonly PassageSpan[]): boolean {
  return playableRun(passages).length > 0;
}

/**
 * A chapter is complete when its narration has finished and the playable passages cover every
 * sentence of the text.
 */
export function isComplete(input: {
  readonly narrateDone: boolean;
  readonly passages: readonly PassageSpan[];
  readonly sentenceCount: number;
}): boolean {
  if (!input.narrateDone || input.sentenceCount === 0) return false;
  const last = playableRun(input.passages).at(-1);
  return last !== undefined && last.sentenceEnd >= input.sentenceCount - 1;
}
