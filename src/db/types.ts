import type { schema } from './schema';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

/**
 * A synchronous Drizzle SQLite handle. Both `drizzle-orm/expo-sqlite` (app) and
 * `drizzle-orm/better-sqlite3` (tests) satisfy it, so repositories run unchanged in Node.
 * Transactions receive a handle of the same type.
 */
export type Db = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
