import { readFileSync } from 'fs';
import { join } from 'path';

import Database from 'better-sqlite3';

const MIGRATIONS_DIR = join(__dirname, 'migrations');
const BEFORE = [
  '0000_swift_omega_sentinel',
  '0001_fts5_sentences',
  '0002_curly_redwing',
  '0003_foamy_nuke',
  '0004_uneven_zuras',
];
const INTEGRITY = '0005_integrity_fixes';

/** Runs a migration file the way drizzle's migrator does: one statement per breakpoint. */
function runMigration(sqlite: Database.Database, tag: string): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim() !== '') sqlite.exec(statement);
  }
}

/**
 * The state an existing install has before 0005: two series with translations (one whose target
 * language is Italian), one with no translation, and entities whose aliases are JSON arrays.
 */
function seedBefore(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO series (id, title, cover_uri, cover_tint, source_lang, target_lang,
      narration_profile_id, created_at, updated_at)
      VALUES ('S1', 'One', NULL, NULL, 'en', 'it', NULL, 1, 1),
             ('S2', 'Two', NULL, NULL, 'en', NULL, NULL, 1, 1);
    INSERT INTO chapters (id, series_id, "order", title, source, source_lang, status,
      word_count, duration_ms, created_at, updated_at)
      VALUES ('C1', 'S1', 1, 'One', '{}', 'en', 'ready', NULL, NULL, 1, 1),
             ('C2', 'S2', 1, 'Two', '{}', 'en', 'ready', NULL, NULL, 1, 1);
    INSERT INTO sentences (id, chapter_id, idx, paragraph_idx, text, translated, char_count)
      VALUES (1, 'C1', 0, 0, 'Rain.', 'Pioggia.', 6),
             (2, 'C1', 1, 0, 'Wind.', NULL, 5),
             (3, 'C2', 0, 0, 'Snow.', 'Neve.', 5);
    INSERT INTO entities (id, series_id, kind, canonical_name, aliases, first_chapter_order)
      VALUES ('E1', 'S1', 'character', 'Jon', '["The Prince","Jon Snow","  ",""]', 1),
             ('E2', 'S1', 'place', 'Wall', '[]', 2),
             ('E3', 'S2', 'character', 'Ann', 'not json', 4);
    INSERT INTO usage_ledger (id, at, chapter_id, stage, model, prompt_tokens, completion_tokens,
      audio_seconds, cost_usd, generation_id)
      VALUES ('U1', 1, 'C1', 'narrate', 'm', 1, 1, NULL, 0.25, NULL);
  `);
}

describe('migration 0005 (integrity fixes)', () => {
  function migrated(): Database.Database {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    for (const tag of BEFORE) runMigration(sqlite, tag);
    seedBefore(sqlite);
    runMigration(sqlite, INTEGRITY);
    return sqlite;
  }

  it('stamps each stored translation with the series target language, and leaves untranslated sentences unstamped', () => {
    const rows = migrated()
      .prepare('SELECT id, translated, translated_lang FROM sentences ORDER BY id')
      .all();

    expect(rows).toEqual([
      { id: 1, translated: 'Pioggia.', translated_lang: 'it' },
      { id: 2, translated: null, translated_lang: null },
      // Series S2 has no target language, so its translation has no language to stamp.
      { id: 3, translated: 'Neve.', translated_lang: null },
    ]);
  });

  it('moves each alias into its own row with the entity first chapter, dropping blanks and bad JSON', () => {
    const rows = migrated()
      .prepare(
        'SELECT entity_id, alias, first_chapter_order FROM entity_aliases ORDER BY entity_id, alias',
      )
      .all();

    expect(rows).toEqual([
      { entity_id: 'E1', alias: 'Jon Snow', first_chapter_order: 1 },
      { entity_id: 'E1', alias: 'The Prince', first_chapter_order: 1 },
    ]);
  });

  it('removes the old JSON aliases column from entities', () => {
    const columns = migrated()
      .prepare("SELECT name FROM pragma_table_info('entities')")
      .all() as { name: string }[];

    expect(columns.map((column) => column.name)).not.toContain('aliases');
  });

  it('keeps existing usage rows and lets a cost be unknown (null)', () => {
    const sqlite = migrated();
    sqlite
      .prepare(
        "INSERT INTO usage_ledger (id, at, chapter_id, stage, model, prompt_tokens, completion_tokens, cost_usd) VALUES ('U2', 2, NULL, 'qa', 'm', 1, 1, NULL)",
      )
      .run();

    const rows = sqlite.prepare('SELECT id, cost_usd FROM usage_ledger ORDER BY id').all();

    expect(rows).toEqual([
      { id: 'U1', cost_usd: 0.25 },
      { id: 'U2', cost_usd: null },
    ]);
  });

  it('creates the chunk cache with its per-chunk key, and deletes it with its chapter', () => {
    const sqlite = migrated();
    sqlite
      .prepare(
        "INSERT INTO chunk_cache (chapter_id, kind, input_hash, model, prompt_version, result, created_at) VALUES ('C1', 'translation', 'h', 'm', 'v1', '{}', 1)",
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO chunk_cache (chapter_id, kind, input_hash, model, prompt_version, result, created_at) VALUES ('C1', 'translation', 'h', 'm', 'v1', '{}', 2)",
        )
        .run(),
    ).toThrow(/UNIQUE/);

    sqlite.prepare("DELETE FROM chapters WHERE id = 'C1'").run();

    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM chunk_cache').get()).toEqual({ n: 0 });
  });
});
