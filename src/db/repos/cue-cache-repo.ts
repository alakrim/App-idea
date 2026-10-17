import { eq } from 'drizzle-orm';

import { CachedCuesSchema } from '../../core/analysis/cue-cache';
import { parseJsonColumn } from '../json-column';
import { ambienceCueCache } from '../schema';

import type { ValidatedCue } from '../../core/analysis/types';
import type { Db } from '../types';

export const cueCacheRepo = {
  /** The cues cached under `key`, validated on read. Null when there is no entry. */
  get(db: Db, key: string): ValidatedCue[] | null {
    const row = db.select().from(ambienceCueCache).where(eq(ambienceCueCache.key, key)).get();
    if (!row) return null;
    return parseJsonColumn(CachedCuesSchema, row.cues, {
      table: 'ambience_cue_cache',
      column: 'cues',
      id: key,
    });
  },

  /** Stores the validated cues under `key`, replacing any earlier entry for the same text. */
  put(db: Db, key: string, cues: readonly ValidatedCue[], createdAt: number): void {
    const valid = CachedCuesSchema.parse(cues);
    db.insert(ambienceCueCache)
      .values({ key, cues: JSON.stringify(valid), createdAt })
      .onConflictDoUpdate({
        target: ambienceCueCache.key,
        set: { cues: JSON.stringify(valid), createdAt },
      })
      .run();
  },
};
