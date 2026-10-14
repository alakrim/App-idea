import { asc, eq } from 'drizzle-orm';

import { ambienceCues } from '../schema';

import type { AmbienceCue } from '../../core/domain';
import type { Db } from '../types';

function rangeKey(cue: Pick<AmbienceCue, 'category' | 'startSentence' | 'endSentence'>): string {
  return `${cue.category}:${cue.startSentence}:${cue.endSentence}`;
}

export const cueRepo = {
  /** A chapter's ambience cues, in the order they start. */
  listForChapter(db: Db, chapterId: string): AmbienceCue[] {
    return db
      .select()
      .from(ambienceCues)
      .where(eq(ambienceCues.chapterId, chapterId))
      .orderBy(asc(ambienceCues.startSentence))
      .all();
  },

  /**
   * Replaces a chapter's cues in one transaction. A cue that comes back with the same category and
   * sentence range keeps the listener's `enabled` choice, so re-running analysis never re-enables a
   * cue the listener switched off. Every other cue is stored as given.
   */
  replaceForChapter(db: Db, chapterId: string, cues: readonly AmbienceCue[]): void {
    db.transaction((tx) => {
      const previous = tx
        .select()
        .from(ambienceCues)
        .where(eq(ambienceCues.chapterId, chapterId))
        .all();
      const choices = new Map(previous.map((cue) => [rangeKey(cue), cue.enabled]));
      tx.delete(ambienceCues).where(eq(ambienceCues.chapterId, chapterId)).run();
      for (const cue of cues) {
        if (cue.chapterId !== chapterId) {
          throw new Error(`Cue ${cue.id} belongs to chapter ${cue.chapterId}`);
        }
        tx.insert(ambienceCues)
          .values({ ...cue, enabled: choices.get(rangeKey(cue)) ?? cue.enabled })
          .run();
      }
    });
  },

  /** The listener's switch for one cue. Analysis never resets it. */
  setEnabled(db: Db, id: string, enabled: boolean): void {
    db.update(ambienceCues).set({ enabled }).where(eq(ambienceCues.id, id)).run();
  },
};
