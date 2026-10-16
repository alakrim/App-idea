# src/db

Drizzle schema, migrations and repositories for the on-device SQLite library.

**Layout**
- `schema.ts`: every table, grouped as library (series, chapters, paragraphs, sentences), analysis (cues, memory, entities), audio, jobs, usage, playback positions, Q&A, vocab and settings.
- `repos/`: one repository object per table group (`seriesRepo`, `chapterRepo`, `jobRepo`, ...). Each takes a `Db` handle.
- `migrations/`: drizzle SQL and journal. `0001` adds the FTS5 sentence index. `bundled-migrations.ts` compiles them into the app.
- `client.ts`: `getDatabase()`, the open expo-sqlite database. `types.ts`: `Db`, the handle the repos use.
- `hooks.ts`: `useDb()`, `useLiveRead()`, and the library hooks (`useSeriesList`, `useChapters`, `useJobs`).
- `json-column.ts`: `parseJsonColumn()` validates JSON columns with zod. `use-migrations.ts`: `useLectioMigrations()`.

**Entry points**
- `schema.ts`: the table definitions.
- `repos/chapter-repo.ts`: `chapterRepo`.
- `hooks.ts`: `useLiveRead()`.
- `json-column.ts`: `parseJsonColumn()` and `DbValidationError`.

**Gotchas**
- After `npm run db:generate`, add the new migration to `bundled-migrations.ts`.
- Repos take a `Db` handle, so the same code runs in Node tests on better-sqlite3.
- Table names are snake_case plural. Validate every JSON column with zod when it is read.
- The `settings` repo ignores the `pipelineQueue` key: it is queue state, not a user setting.

**Tests**: `*.test.ts` beside each repo and the schema. `__fixtures__/` has the test database and factories. Runs in the `node` Jest project: `npm test`.

**Import rules**

- May import from `src/core` (domain types) and `src/services`. Never from `src/features` or `src/ui`.
- Table names are `snake_case` plural. Validate JSON columns with zod at the boundary.
