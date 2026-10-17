import { readFileSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { getTableName, is } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

import { repairSchema } from './repair-schema';
import { schema } from './schema';

/**
 * Two real starting states meet the bundled migrations. drizzle's migrator skips any migration whose
 * `when` is not later than the newest recorded one, so the order of the recorded rows decides what runs.
 */
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const FIXTURES_DIR = path.join(__dirname, '__fixtures__');
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

interface JournalEntry {
  readonly tag: string;
  readonly when: number;
}
interface AppliedMigration {
  readonly tag: string;
  readonly when: number;
  readonly sql: string;
}

const journal = JSON.parse(
  readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
) as { entries: JournalEntry[] };

function applied(tag: string): AppliedMigration {
  const entry = journal.entries.find((candidate) => candidate.tag === tag);
  if (entry === undefined) throw new Error(`No journal entry ${tag}`);
  return { tag, when: entry.when, sql: readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8') };
}

/** The ambience-only 0003 that the serene-hypatia build shipped (bfbcc4f, 6842a51). */
const LEGACY_AMBIENCE_0003: AppliedMigration = {
  tag: '0003_ambience_cue_cache',
  when: 1792197185773,
  sql: readFileSync(path.join(FIXTURES_DIR, 'legacy-0003-ambience.sql'), 'utf8'),
};

/** Applies the given migrations and records them the way drizzle does. Only `created_at` drives the migrator. */
function seed(sqlite: Database.Database, migrations: readonly AppliedMigration[]): void {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "hash" text NOT NULL, "created_at" numeric)',
  );
  const record = sqlite.prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)');
  for (const migration of migrations) {
    for (const statement of migration.sql.split(STATEMENT_BREAKPOINT)) sqlite.exec(statement);
    record.run(migration.tag, migration.when);
  }
}

/** Opens the database at a starting state, then runs the app's real startup path: migrate, then repair. */
function upgrade(starting: readonly AppliedMigration[]): Database.Database {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  seed(sqlite, starting);
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: MIGRATIONS_DIR });
  repairSchema({
    columnNames: (table) =>
      (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name),
    exec: (statement) => {
      sqlite.exec(statement);
    },
  });
  return sqlite;
}

function tablesIn(sqlite: Database.Database): string[] {
  return (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  ).map((row) => row.name);
}

function everySchemaTable(): string[] {
  return Object.values(schema)
    .filter((value) => is(value, SQLiteTable))
    .map((table) => getTableName(table));
}

const THEIRS_0004_STATE = [
  applied('0000_swift_omega_sentinel'),
  applied('0001_fts5_sentences'),
  applied('0002_curly_redwing'),
  applied('0003_foamy_nuke'),
  applied('0004_uneven_zuras'),
];

describe('upgrading from the migration states that shipped', () => {
  it('upgrades a database at charming-fermat 0004 to every table and column', () => {
    const sqlite = upgrade(THEIRS_0004_STATE);
    const tables = tablesIn(sqlite);
    for (const table of everySchemaTable()) expect(tables).toContain(table);
    expect(repairColumns(sqlite)).toContain('playback_rate');
    sqlite.close();
  });

  it('upgrades a database at the old ambience 0003 (later timestamp) to every table and column', () => {
    const sqlite = upgrade([
      applied('0000_swift_omega_sentinel'),
      applied('0001_fts5_sentences'),
      applied('0002_curly_redwing'),
      LEGACY_AMBIENCE_0003,
    ]);
    const tables = tablesIn(sqlite);
    for (const table of everySchemaTable()) expect(tables).toContain(table);
    expect(repairColumns(sqlite)).toContain('playback_rate');
    sqlite.close();
  });

  it('creates chapter_positions when the 0004 state is upgraded', () => {
    const sqlite = upgrade(THEIRS_0004_STATE);
    expect(tablesIn(sqlite)).toContain('chapter_positions');
    sqlite.close();
  });
});

describe('repairSchema', () => {
  it('adds playback_rate when the column is missing', () => {
    const calls: string[] = [];
    const columns = ['id', 'title'];
    repairSchema({
      columnNames: () => columns,
      exec: (statement) => calls.push(statement),
    });
    expect(calls).toEqual(['ALTER TABLE `series` ADD `playback_rate` real']);
  });

  it('does nothing when playback_rate already exists', () => {
    const calls: string[] = [];
    repairSchema({
      columnNames: () => ['id', 'playback_rate'],
      exec: (statement) => calls.push(statement),
    });
    expect(calls).toEqual([]);
  });
});

function repairColumns(sqlite: Database.Database): string[] {
  return (sqlite.prepare('PRAGMA table_info(series)').all() as { name: string }[]).map((row) => row.name);
}
