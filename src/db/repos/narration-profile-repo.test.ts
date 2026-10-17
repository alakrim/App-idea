import { eq } from 'drizzle-orm';

import { narrationProfileRepo } from './narration-profile-repo';
import { id } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';
import { narrationProfiles } from '../schema';

import type { NarrationProfile } from '../../core/domain';
import type { Db } from '../types';

/** The stored row, read without the repo. Its columns are the profile's fields. */
function storedProfile(db: Db, profileId: string): NarrationProfile | null {
  return (
    db.select().from(narrationProfiles).where(eq(narrationProfiles.id, profileId)).get() ?? null
  );
}

const PROFILE: NarrationProfile = {
  id: id(7),
  name: 'Gemini · Kore',
  provider: 'openrouter',
  model: 'google/gemini-3.8-flash-lite-tts',
  voice: 'Kore',
  style: 'Warm audiobook narrator.',
  speed: 1,
};

describe('narrationProfileRepo', () => {
  it('stores a profile and reads it back unchanged', () => {
    const { db } = createTestDb();
    narrationProfileRepo.upsert(db, PROFILE);
    expect(storedProfile(db, id(7))).toEqual(PROFILE);
  });

  it('keeps one row per id and refreshes the display name', () => {
    const { db } = createTestDb();
    narrationProfileRepo.upsert(db, PROFILE);
    narrationProfileRepo.upsert(db, { ...PROFILE, name: 'Kore (renamed)' });
    expect(storedProfile(db, id(7))?.name).toBe('Kore (renamed)');
  });

  it('returns null for an unknown id', () => {
    const { db } = createTestDb();
    expect(storedProfile(db, id(8))).toBeNull();
  });

  it('rejects an invalid profile without writing it', () => {
    const { db } = createTestDb();
    expect(() => narrationProfileRepo.upsert(db, { ...PROFILE, speed: 3 })).toThrow();
    expect(storedProfile(db, id(7))).toBeNull();
  });
});
