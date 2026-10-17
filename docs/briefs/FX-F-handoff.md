# FX-F handoff: never pay twice, never lose data

**Branch:** the FX-F worktree branch on the unified line. **Part 1 checkpoint:** `4e7c772`. **Part 2 checkpoint:** the commit that adds this text (see the commit log). Nothing is pushed.

Part 2 stopped at the context budget (about 100 tool calls in part 2). Migration 0006 and F-02, F-03, F-04 and F-10 are done and mutation-checked. The rest is listed below, in brief order.

## Part 1 (committed in `4e7c772`)

| Item | Finding | Change | Test | Mutation check |
|---|---|---|---|---|
| 1 | F-01 retired reply re-sent | `transport.ts`: an attempt leaves the in-flight set once its headers arrive. Stale retries are capped at 2 per call. | `transport-stale-retry.test.ts` (flipped). `stale.test.ts`: cap test. | Remove the post-header `unregister()`: proof fails. Remove the cap: cap test fails. |
| 2 | F-06 narration reuse by position | `narrate.ts`: clips are content-addressed. Any stored clip with the same hash is reused. Clip files are pruned after the new plan is stored. | `narrate.test.ts`: 2 new tests. | Disable reuse from files: fails. Disable the prune: fails. |
| 3 | F-05 finished passages dropped | `tts-pool.ts`: every successful passage is saved as it finishes. | `tts-pool-gap.test.ts` (flipped). `tts-pool.test.ts`: 4 tests rewritten. | Drop saves behind a failure: 2 tests fail. |

## Part 2 (this checkpoint)

### Migration 0006 (`src/db/migrations/0006_fx_f_money_and_data.sql`)
- Generated with drizzle-kit, then hand-edited to be idempotent: `CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`, `CREATE INDEX IF NOT EXISTS`, and no PRAGMA lines.
- New tables: `analysis_chunk_checkpoints` (chapter, chunk key, JSON response), `chapter_translations` (chapter, target language, updated at), `entity_aliases` (entity, alias, first chapter order).
- `usage_ledger` rebuilt so `cost_usd` is nullable. The rebuild copies every row, and it can be re-run without losing rows.
- Backfill: legacy aliases get `first_chapter_order` = the series' latest chapter order. This is conservative: an old alias is hidden from every earlier cutoff. The cost is that an old alias is not shown in prior context until a chapter after the series' latest one is analysed.
- `bundled-migrations.ts` imports and maps `m0006`. Upgrade-path tests: `src/db/upgrade-paths.test.ts` (2 new tests, from 0005 with data, and a re-run).

### Done

| Item | Finding | Change | Test | Mutation check |
|---|---|---|---|---|
| 4 | F-02 analysis retry re-buys chunks | `map-reduce.ts` `runChunk`: a checkpoint is keyed by `stableHash(scope, system, user)`. The scope is model and prompt version. A reused reply makes no call and has zero usage. `analyze.ts` passes the store, and clears the chapter's checkpoints after the memory is saved. The `checkpoint.ts` zod schema validates every read. | `map-reduce-retry.test.ts` (flipped, plus 2 new: scope isolation, usage of a reused chunk). The proof input now passes an in-memory store (the port changed). | Stop saving checkpoints: 2 tests fail. |
| 5 | F-03 alias spoiler | `EntitySchema.aliasReveals` (alias and first chapter order). `entities.ts` stamps each new alias. `aliasesRevealedBefore` (strict, codex and Ask) and `aliasesRevealedBy` (inclusive, glossary). `memory-repo.ts` reads and writes `entity_aliases`, and the first reveal wins. Ask's keyword names use only the visible aliases. | `codex-alias.test.ts` (flipped). | Show every alias in codex: fails. |
| 6 | F-04 unknown cost stored as $0 | `meter.ts`: an unknown cost is `null`, not added to the total, and not reported to `onSpend`. `ask-service.ts` and `vocab-actions.ts` pass the reply's cost as it is, with no `?? 0`. Usage shows "unknown": `usage-repo` adds `unknownCalls`, `usage-view` shows "unknown" or "+ unknown", and `unknownCostNote` is tested. | `meter-unknown-cost.test.ts` (flipped). `unknown-cost-note.test.ts`. Expectations in `usage-repo`, `chapter-repo`, `vocab-actions` and `ask-service` tests updated for `unknownCalls`. | Record unknown as `0`: fails. |
| 7 | F-10 PDF over 25 MB | `pdf-limit.ts` (`PDF_MAX_BYTES`, `pdfSizeProblem`). `add-chapter-screen.tsx` refuses at pick time, with the copy "This PDF is 38 MB. Lectio can read PDFs up to 25 MB." | `pdf-limit.test.ts` (5 tests). The screen wiring is not unit-tested. | Accept every size: 3 tests fail. |

### Not done (in brief order)

- **F-07 playability** (`series-data.ts`, `chapter-status.ts`, `listen-now.ts`): not started. Plan: derive playable from saved segments and the narrate job, per F3 P1-2.
- **F-08 translation language**: not started. Migration 0006 has `chapter_translations`. Still to do: write the row when translations commit, mark stale when the series target language differs, and make the narrate-only path refuse stale text. Write the repro test first.
- **F-09 STORAGE_FULL and preflight**: not started. Map ENOSPC and "no space" write errors to `STORAGE_FULL` in the file adapter. Preflight free space before narrating.
- **F-11 retry budgets and paid retries in the ledger**: not started (`client.ts` `maxRetries: 3`, the pool's 4 retries, and the malformed-200 retry inside the transport).
- **F-12 queue save failures** (`facade.ts` `.catch(() => undefined)`, `queue.ts retryNow`): not started. Surface the failure, and add one Diagnostics row.
- **F-13 delete stops the run first**: not started. The plan: `SeriesServiceDeps.stopRun(chapterId): Promise<void>`. The facade cancels, then polls `snapshot().running` until it is not that chapter, with a timeout of about 5 s. `deleteChapter` and `deleteSeries` await it before they delete rows and files. Callers: `series-screen.tsx:181,258` and `library-screen.tsx:73`.
- **F-14 WebView HTML cap** (`webview-script.ts`): not started.
- **F-15 context-length 400 copy** (`error-mapping.ts`): not started.
- **P3s F-16 to F-19**: not started.

### Gaps in what is done
- `generation_id` is still always null. The column is nullable and exists, but `LlmUsage` does not carry the id yet (`chat.ts` and `speech.ts`). This is part of F-04 and is still open.
- A job's `cost_usd` (the stage total) sums only the known costs. The chapter view shows the known total, not "unknown".
- The alias backfill is conservative (see above).

## Verify

- `npm run verify`: exit 0. Tail: `Test Suites: 283 passed, 283 total`, `Tests: 2582 passed, 2582 total`, `Snapshots: 2 passed, 2 total`.
- `npm run contract:check`: `31 OK, 0 FAIL of 31 checks`.
- Mutation results are in the table above.
