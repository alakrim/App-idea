import { NarrationProfileSchema } from '../../core/domain';
import { narrationProfiles } from '../schema';

import type { NarrationProfile } from '../../core/domain';
import type { Db } from '../types';

export const narrationProfileRepo = {
  /**
   * Stores a profile, or refreshes its display name when the id is already stored. The id is derived
   * from the voice settings, so the same settings always map to the same row, and audio segments can
   * reference it with a foreign key.
   */
  upsert(db: Db, profile: NarrationProfile): void {
    const valid = NarrationProfileSchema.parse(profile);
    db.insert(narrationProfiles)
      .values(valid)
      .onConflictDoUpdate({ target: narrationProfiles.id, set: { name: valid.name } })
      .run();
  },
};
