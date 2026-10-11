import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { schema } from '../schema';

import type { Db } from '../types';

export interface TestDb {
  sqlite: Database.Database;
  db: Db;
}

/** An in-memory SQLite database with every migration applied, the same SQL the app ships. */
export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '..', 'migrations') });
  return { sqlite, db };
}
