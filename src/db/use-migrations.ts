import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useMemo } from 'react';

import { bundledMigrations } from './bundled-migrations';
import { repairSchema } from './repair-schema';

import type { LectioDatabase } from './client';

interface MigrationState {
  readonly success: boolean;
  readonly error: Error | undefined;
}

/**
 * Applies pending migrations once per mount, then repairs the columns the merged schema needs.
 * Render a loading state until `success` is true, and a failure state when `error` is set.
 */
export function useLectioMigrations(db: LectioDatabase): MigrationState {
  const migration = useMigrations(db, bundledMigrations);
  // The repair is synchronous and idempotent, so it runs during render once migrations succeed,
  // instead of setting state from an effect.
  const repair = useMemo((): { done: boolean; error: Error | undefined } => {
    if (!migration.success) return { done: false, error: undefined };
    const client = db.$client;
    try {
      repairSchema({
        columnNames: (table) =>
          client.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name),
        exec: (statement) => client.execSync(statement),
      });
      return { done: true, error: undefined };
    } catch (error) {
      return { done: true, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [migration.success, db]);

  return {
    success: migration.success && repair.done && repair.error === undefined,
    error: migration.error ?? repair.error,
  };
}
