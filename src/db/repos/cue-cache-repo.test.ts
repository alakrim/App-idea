import { cueCacheRepo } from './cue-cache-repo';
import { createTestDb } from '../__fixtures__/test-db';
import { DbValidationError } from '../json-column';

import type { ValidatedCue } from '../../core/analysis/types';

const CUES: ValidatedCue[] = [
  {
    category: 'tavern_crowd',
    startSentence: 0,
    endSentence: 4,
    intensity: 'high',
    fadeInMs: 2000,
    fadeOutMs: 2500,
    confidence: 0.6,
    reason: 'Glasses and talk.',
  },
];

describe('cueCacheRepo', () => {
  it('returns null for a key that was never stored', () => {
    const { db } = createTestDb();
    expect(cueCacheRepo.get(db, 'missing')).toBeNull();
  });

  it('round-trips validated cues, including an empty list', () => {
    const { db } = createTestDb();
    cueCacheRepo.put(db, 'k1', CUES, 1);
    cueCacheRepo.put(db, 'k2', [], 2);

    expect(cueCacheRepo.get(db, 'k1')).toEqual(CUES);
    expect(cueCacheRepo.get(db, 'k2')).toEqual([]);
  });

  it('replaces the entry when the same key is stored again', () => {
    const { db } = createTestDb();
    cueCacheRepo.put(db, 'k1', CUES, 1);
    cueCacheRepo.put(db, 'k1', [], 2);
    expect(cueCacheRepo.get(db, 'k1')).toEqual([]);
  });

  it('refuses to store cues that do not validate', () => {
    const { db } = createTestDb();
    const bad = [{ ...CUES[0], intensity: 'loud' }] as unknown as ValidatedCue[];
    expect(() => cueCacheRepo.put(db, 'k1', bad, 1)).toThrow();
    expect(cueCacheRepo.get(db, 'k1')).toBeNull();
  });

  it('rejects a stored row that does not match the schema, instead of trusting it', () => {
    const { db, sqlite } = createTestDb();
    sqlite
      .prepare(`INSERT INTO ambience_cue_cache (key, cues, created_at) VALUES (?, ?, 0)`)
      .run('corrupt', '{"not":"cues"}');
    expect(() => cueCacheRepo.get(db, 'corrupt')).toThrow(DbValidationError);
  });
});
