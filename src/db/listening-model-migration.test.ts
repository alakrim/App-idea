import { readFileSync } from 'fs';
import { join } from 'path';

import Database from 'better-sqlite3';

const MIGRATIONS_DIR = join(__dirname, 'migrations');
const BEFORE = [
  '0000_swift_omega_sentinel',
  '0001_fts5_sentences',
  '0002_curly_redwing',
  '0003_foamy_nuke',
];
const LISTENING_MODEL = '0004_uneven_zuras';

/** Runs a migration file the way drizzle's migrator does: one statement per breakpoint. */
function runMigration(sqlite: Database.Database, tag: string): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim() !== '') sqlite.exec(statement);
  }
}

/**
 * Seeds the state an existing install has before 0004: two series with narration, and one with no
 * narration at all. Each series has a current chapter in listening_positions.
 */
function seedBefore(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO narration_profiles (id, name, provider, model, voice, style, speed)
      VALUES ('P', 'Narrator', 'openrouter', 'm', 'v', NULL, 1);
    INSERT INTO series (id, title, cover_uri, cover_tint, source_lang, target_lang,
      narration_profile_id, created_at, updated_at)
      VALUES ('S1', 'One', NULL, NULL, 'en', NULL, NULL, 1, 1),
             ('S2', 'Two', NULL, NULL, 'en', NULL, NULL, 1, 1),
             ('S3', 'Three', NULL, NULL, 'en', NULL, NULL, 1, 1);
    INSERT INTO chapters (id, series_id, "order", title, source, source_lang, status,
      word_count, duration_ms, created_at, updated_at)
      VALUES ('C1', 'S1', 1, 'One', '{}', 'en', 'ready', NULL, 10000, 1, 1),
             ('C2', 'S2', 1, 'Two', '{}', 'en', 'ready', NULL, 10000, 1, 1),
             ('C3', 'S3', 1, 'Three', '{}', 'en', 'ready', NULL, NULL, 1, 1);
    INSERT INTO audio_segments (id, chapter_id, idx, sentence_start, sentence_end, file_uri,
      duration_ms, sentence_offsets_ms, profile_id, input_hash)
      VALUES ('A1', 'C1', 0, 0, 1, 'file:///1.m4a', 4000, '[0,2000]', 'P', 'h'),
             ('A2', 'C1', 1, 2, 3, 'file:///2.m4a', 6000, '[0,3000]', 'P', 'h'),
             ('A3', 'C2', 0, 0, 1, 'file:///3.m4a', 4000, '[0,2000]', 'P', 'h');
    INSERT INTO listening_positions (series_id, current_chapter_id, current_chapter_order,
      current_sentence_idx, furthest_chapter_id, furthest_chapter_order, furthest_sentence_idx,
      updated_at)
      VALUES ('S1', 'C1', 1, 3, 'C1', 1, 3, 500),
             ('S2', 'C2', 1, 1, 'C2', 1, 1, 600),
             ('S3', 'C3', 1, 0, 'C3', 1, 0, 700);
  `);
}

describe('migration 0004 (listening model)', () => {
  function migrated(): Database.Database {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    for (const tag of BEFORE) runMigration(sqlite, tag);
    seedBefore(sqlite);
    runMigration(sqlite, LISTENING_MODEL);
    return sqlite;
  }

  it('seeds each series current chapter with its place in media time', () => {
    const sqlite = migrated();

    const rows = sqlite
      .prepare(
        'SELECT chapter_id, sentence_idx, position_ms, completed, updated_at FROM chapter_positions ORDER BY chapter_id',
      )
      .all();

    expect(rows).toEqual([
      // Sentence 3 starts 3 s into the second segment, which starts at 4 s.
      { chapter_id: 'C1', sentence_idx: 3, position_ms: 7000, completed: 0, updated_at: 500 },
      // Sentence 1 starts 2 s into the only segment.
      { chapter_id: 'C2', sentence_idx: 1, position_ms: 2000, completed: 0, updated_at: 600 },
      // No narration yet, so the saved place is the start.
      { chapter_id: 'C3', sentence_idx: 0, position_ms: 0, completed: 0, updated_at: 700 },
    ]);
  });

  it('adds the series speed column, empty for existing series', () => {
    const sqlite = migrated();

    const rates = sqlite.prepare('SELECT id, playback_rate FROM series ORDER BY id').all();

    expect(rates).toEqual([
      { id: 'S1', playback_rate: null },
      { id: 'S2', playback_rate: null },
      { id: 'S3', playback_rate: null },
    ]);
  });

  it('creates the bookmarks table with its unique sentence rule', () => {
    const sqlite = migrated();

    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'bookmarks'")
      .all() as { name: string }[];

    expect(indexes.map((index) => index.name)).toContain('bookmarks_chapter_sentence_uq');
  });
});
