# FX-F handoff: never pay twice, never lose data

**Branch:** `worktree-agent-a21b10bc8e0b522a1` (a worktree of the unified line). **Checkpoint SHA:** `4e7c772` (fixes). This file is committed after it. Nothing is pushed.

Stopped at the context budget (about 115 tool calls). The money items F-01, F-05 and F-06 are done and mutation-checked. The rest is not started, and F-02, F-03 and F-04 need **migration 0006** first.

## Done (committed in `4e7c772`)

| Item | Finding | Change | Test | Mutation check |
|---|---|---|---|---|
| 1 | F-01 retired reply re-sent | `transport.ts`: an attempt leaves the connection's in-flight set once its headers arrive. Stale retries are capped at 2 per call (`MAX_STALE_RETRIES`). | `transport-stale-retry.test.ts` (proof flipped, now in the regular suite). `stale.test.ts`: new cap test. | Remove the post-header `unregister()`: proof fails (2 failed). Remove the cap: cap test fails (2 failed). |
| 2 | F-06 narration reuse by position | `narrate.ts`: clips are content-addressed (`<hash>-<ms>.<ext>`). Any stored clip with the same hash is reused, whatever its index. Rows are replaced only from the first mismatch. Clip files are pruned after the new plan is stored (`AudioFiles.prune`). | `narrate.test.ts`: 2 new tests (moved plan makes 0 speech calls and prunes stale clips; one missing clip makes exactly 1 call). | Disable reuse from files: fails. Disable the prune: fails. |
| 3 | F-05 finished passages dropped behind a failure | `tts-pool.ts`: `save` runs for every successful item as it finishes, never waiting for predecessors. The narrate stage announces in order. | `tts-pool-gap.test.ts` (proof flipped). `tts-pool.test.ts`: 4 tests rewritten to the new contract. `e2e.test.ts`: file-name assertion updated. | Drop saves behind a failure: 2 tests fail. |

## Not done (in order of the brief)

- **Item 4, F-02 analysis checkpoints.** Needs a per-chunk checkpoint table (chapter, chunk hash, model, prompt version). That is migration 0006. The proof `src/core/analysis/map-reduce-retry.audit.test.ts` still fails and stays excluded.
- **Item 5, F-11 retry budgets.** Not started. Speech retries 3 times in the client, and the pool retries congestion 4 times. Each pool retry gets 4 transport attempts. A malformed 200 is retried inside the transport without a ledger row. Needs one budget per paid call, and a ledger row for each billed attempt.
- **Item 6, F-04 unknown cost as $0.** Needs `usage_ledger.cost_usd` to be nullable (migration 0006 rebuilds the table). Also needs the domain type, the usage UI ("unknown") and removing `?? 0` in `ask-service.ts` and `vocab-actions.ts`. The proof `meter-unknown-cost.audit.test.ts` still fails and stays excluded.
- **Item 7, F-03 alias spoiler.** Needs an `entity_aliases(entity_id, alias, first_chapter_order)` table (migration 0006), then the cutoff filter in `codex.ts` and `translate/glossary.ts`. The proof `codex-alias.audit.test.ts` still fails and stays excluded.
- **Items 8 to 14 (F-07 to F-15):** not started. F-07 playability, F-08 translation language, F-09 `STORAGE_FULL`, F-10 PDF 25 MB cap, F-12 queue save failures, F-13 delete stops the run, F-14 WebView cap, F-15 context-length copy.
- **P3s (F-16 to F-19):** not started.
- **Migration 0006:** not started. It is needed for F-02, F-03, F-04 and F-08.

## Out of scope, noted

- `src/features/diagnostics/**`, `src/audio/**` and `src/features/player/**` are untouched, as the brief requires.
- The F-05 playback side relies on the existing contiguous-prefix reader. The reader was not changed.
- `source-preview.test.ts` and `runner.test.ts` fail if run with `npx jest --testPathIgnorePatterns=...`. The cause is the override, not the code. The plain `npm test` run passes.

## Verify

Run in this worktree after commit `4e7c772`: `npm run typecheck` (clean), `npm run lint` (clean), `npm test` (278 suites, 2,566 tests, all passed). The final verify and contract output is in the report.
