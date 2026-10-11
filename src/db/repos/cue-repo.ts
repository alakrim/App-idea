import { asc, eq } from 'drizzle-orm';

import { ambienceCues } from '../schema';

import type { AmbienceCue } from '../../core/domain';
import type { Db } from '../types';

export const cueRepo = {
  insert(db: Db, cue: AmbienceCue): void {
    db.insert(ambienceCues).values(cue).run();
  },

  /** A chapter's ambience cues, in the order they start. */
  listForChapter(db: Db, chapterId: string): AmbienceCue[] {
    return db
      .select()
      .from(ambienceCues)
      .where(eq(ambienceCues.chapterId, chapterId))
      .orderBy(asc(ambienceCues.startSentence))
      .all();
  },

  /** The listener's switch for one cue. Analysis never resets it. */
  setEnabled(db: Db, id: string, enabled: boolean): void {
    db.update(ambienceCues).set({ enabled }).where(eq(ambienceCues.id, id)).run();
  },
};
