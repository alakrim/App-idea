import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { schema } from './schema';

import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'lectio.db';

export type LectioDatabase = ExpoSQLiteDatabase<typeof schema>;

interface OpenDatabase {
  client: SQLiteDatabase;
  db: LectioDatabase;
}

let opened: OpenDatabase | null = null;

/**
 * The app's single database connection, opened on first use. Migrations are applied separately
 * with `useLectioMigrations()` (see use-migrations.ts) before any repository is called.
 */
export function getDatabase(): LectioDatabase {
  if (opened === null) {
    const client = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
    client.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    opened = { client, db: drizzle(client, { schema }) };
  }
  return opened.db;
}
