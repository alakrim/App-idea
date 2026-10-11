import { chapterRow, id, seriesRow, T0 } from './__fixtures__/factories';
import { createTestDb } from './__fixtures__/test-db';
import { chapterRepo } from './repos/chapter-repo';
import { seriesRepo } from './repos/series-repo';

describe('schema constraints', () => {
  it('enforces foreign keys', () => {
    const { sqlite } = createTestDb();

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO sentences (chapter_id, idx, paragraph_idx, text, translated, char_count)
           VALUES (?, 0, 0, 'orphan', NULL, 6)`,
        )
        .run(id(404)),
    ).toThrow(/FOREIGN KEY/);
  });

  it('enforces one sentence per (chapter, idx)', () => {
    const { db, sqlite } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    const insert = sqlite.prepare(
      `INSERT INTO sentences (chapter_id, idx, paragraph_idx, text, translated, char_count)
       VALUES (?, 0, 0, 'x', NULL, 1)`,
    );
    insert.run(id(1));

    expect(() => insert.run(id(1))).toThrow(/UNIQUE/);
  });

  it('restricts deleting a narration profile that still has audio segments', () => {
    const { db, sqlite } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    sqlite
      .prepare(
        `INSERT INTO narration_profiles (id, name, provider, model, voice, style, speed)
         VALUES (?, 'Narrator', 'openrouter', 'm', 'v', NULL, 1)`,
      )
      .run(id(7));
    sqlite
      .prepare(
        `INSERT INTO audio_segments (id, chapter_id, idx, sentence_start, sentence_end, file_uri,
           duration_ms, sentence_offsets_ms, profile_id, input_hash)
         VALUES (?, ?, 0, 0, 0, 'file:///a.m4a', 1000, '[0]', ?, 'h')`,
      )
      .run(id(8), id(1), id(7));

    expect(() => sqlite.prepare('DELETE FROM narration_profiles').run()).toThrow(/FOREIGN KEY/);
  });

  it('cascades chapter memory and listening position rows when a series is deleted', () => {
    const { db, sqlite } = createTestDb();
    seriesRepo.insert(db, seriesRow(1, { createdAt: T0 }));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    sqlite
      .prepare(
        `INSERT INTO chapter_memory (chapter_id, prompt_version, model, memory, updated_at)
         VALUES (?, 'v1', 'm', '{}', ?)`,
      )
      .run(id(1), T0);

    seriesRepo.delete(db, id(1));

    expect(sqlite.prepare('SELECT count(*) AS n FROM chapter_memory').get()).toEqual({ n: 0 });
  });
});
