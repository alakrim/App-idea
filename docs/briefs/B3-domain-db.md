# Brief B3: Domain schemas and local database

**Type**: implementation. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, **`docs/specs/domain.md`** (authoritative) and `docs/decisions/0002-stack-and-audio-engine.md`.

## Goal
Typed domain models plus a SQLite persistence layer that every feature builds on.

## Scope
1. `src/core/domain/`: zod schemas plus inferred types for every entity in `docs/specs/domain.md` (one file per area: `library.ts`, `text.ts`, `pipeline.ts`, `analysis.ts`, `narration.ts`, `usage.ts`, `ids.ts`), and an `index.ts` barrel. `ids.ts` provides `newId()` (ULID, pure JS, using the `ulid` package with an injectable PRNG for tests). `AmbienceCategoryId` is a `z.string()` placeholder for now, with a comment that the taxonomy brief will narrow it.
2. `src/db/schema.ts`: Drizzle (`drizzle-orm/sqlite-core`) tables
   - `series`, `chapters`, `paragraphs`, `sentences`, `ambience_cues`, `chapter_memory` (JSON column), `entities`, `entity_facts`, `audio_segments`, `jobs`, `usage_ledger`, `listening_positions`, `qa_messages` (`id, seriesId, role 'user'|'assistant', content, cutoffChapterOrder, cutoffSentenceIdx, citations JSON, createdAt`), `vocab` (`id, seriesId, chapterId, sentenceIdx, term, lang, explanation, translation, createdAt`), `narration_profiles`, and `settings` (key/value JSON)
   - FKs with `ON DELETE CASCADE` from the chapter/series children. Indexes on every FK, `(chapter_id, idx)` uniques, and `chapters(series_id, order)`.
   - JSON columns are validated with zod on read in the repository layer.
3. FTS5: a migration that creates `sentences_fts` (external content = `sentences`, columns `text`, `translated`, tokenizer `unicode61 remove_diacritics 2`, plus `trigram` if the SQLite version supports it, for CJK; detect and document the choice) with triggers to keep it in sync.
4. Migrations: `drizzle-kit` config + generated migrations committed under `src/db/migrations`, applied at startup with `useMigrations` from `drizzle-orm/expo-sqlite/migrator`. Add an npm script `db:generate`. Babel/Metro must be able to import `.sql` (follow the Drizzle Expo guide: `babel-plugin-inline-import` and the metro `sourceExts` change). Verify `bundle:check` still passes.
5. `src/db/client.ts`: open the DB (`openDatabaseSync('lectio.db', { enableChangeListener: true })`), enable `PRAGMA foreign_keys = ON` and WAL.
6. Repositories in `src/db/repos/*.ts`. Use plain functions taking a `Db` (dependency-injected so they can be tested):
   - `seriesRepo` (create, update, delete, list with chapter counts + total duration, get)
   - `chapterRepo` (create, reorder via fractional `order`, list by series, get, setStatus, delete)
   - `textRepo` (bulk insert paragraphs + sentences in a transaction, get range, set translations in bulk, FTS search limited to `(seriesId, cutoff)`. **This spoiler-safe query is critical**: only chapters with `order < cutoffOrder`, or `order = cutoffOrder AND idx <= cutoffSentence`)
   - `jobRepo`, `usageRepo` (insert, totals by day/model/chapter), `positionRepo` (upsert; tracks `furthest` separately from `current`)
7. Tests: run the repos against a real SQLite in Node using `better-sqlite3` + `drizzle-orm/better-sqlite3`, structuring the repos to accept either driver (both are sync SQLite drivers with the same Drizzle API). Cover cascade deletes, reorder, bulk text insert, **FTS spoiler cutoff** (a sentence after the cutoff must never be returned) and JSON validation failure.

## Constraints
- **All dependencies are already installed** (`drizzle-orm`, `drizzle-kit`, `expo-sqlite`, `better-sqlite3`, `ulid`, `zod`, `babel-plugin-inline-import`). Do not run `npm install`. Report anything missing.
- Do not touch `src/ui`, `app/`, `src/services` or `src/audio`. Do not touch the `src/core` subfolders other than `domain`; other workers own them. You may edit `jest.config.js` only to add a `db` Node project for `src/db/**/*.test.ts`. You may edit `babel.config.js`/`metro.config.js` for the SQL import.

## Acceptance
`npm run typecheck`, `npm run lint`, `npm test` and `npm run bundle:check` pass (paste the tails). Report the final table list and the FTS tokenizer decision.
