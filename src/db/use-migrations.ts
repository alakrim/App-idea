import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { bundledMigrations } from './bundled-migrations';

import type { LectioDatabase } from './client';

/**
 * Applies pending migrations once per mount. Render a loading state until `success` is true, and
 * a failure state when `error` is set.
 */
export function useLectioMigrations(db: LectioDatabase): ReturnType<typeof useMigrations> {
  return useMigrations(db, bundledMigrations);
}
