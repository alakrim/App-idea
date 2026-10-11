import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { bundledMigrations } from './bundled-migrations';
import { getDatabase } from './client';

/** Applies pending migrations once per mount. Render a loading state until `success` is true. */
export function useLectioMigrations(): ReturnType<typeof useMigrations> {
  return useMigrations(getDatabase(), bundledMigrations);
}
