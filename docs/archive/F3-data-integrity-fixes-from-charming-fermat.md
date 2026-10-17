# Brief F3: Data integrity fixes from the AAA audit

**Type**: implementation (core, services, db, one UI gate). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/STATE.md` (N2–N4, L1, F1, F2, F4 sections: migrations go up to `0004`, so yours is `0005`), and **`docs/qa/2026-10-13-QA-A-pipeline-data.md`**, the source of every item, with file:line. The worker's repro scripts for P1-1 and P2-2 are in `/tmp/claude-0/-home-user-App-idea/005bdf22-f3a2-59c7-918d-ae1c7220d1ea/scratchpad/qa-a/`. Port them into regression tests.

## Scope
1. **P0-1 / QA-D P1-3, size caps.**
   - Refuse PDFs over **25 MB** at pick time, before any read. The copy: "This PDF is 38 MB. Lectio can read PDFs up to 25 MB." Check whether OpenRouter documents a file limit; if a lower one is documented, use it.
   - Cap streamed page bodies at `FETCH_LIMITS.maxBytes` even without a Content-Length (abort while reading). Where React Native gives no streaming reader, read with a cap on the `arrayBuffer` path and reject over the limit.
   - Cap WebView HTML (P2-7) at the same limit.
2. **P1-1, spoiler leak through aliases.**
   - Migration `0005`: `entity_aliases(entity_id FK cascade, alias, first_chapter_order, PRIMARY KEY(entity_id, alias))`. Backfill from the existing alias arrays, using the entity's `first_chapter_order` (conservative).
   - `resolveEntities` writes each new alias with the chapter it was seen in.
   - `buildPriorContext` and alias matching only see aliases with `first_chapter_order < cutoff`.
   - Port the repro as a test ("Jon (also: The Prince)" must not appear at cutoff 3). Mutation-check it.
3. **P1-2, playability derived from state.** A chapter is **playable** when it has at least one saved segment and no run of it is narrating its first segment. It is **complete** when the narrate job is done and its segments cover the whole text.
   - Play, Continue and auto-advance (`series-data.ts`, `playback-data.ts`, L1's `playTarget`) use these, not `status === 'ready'`.
   - Renarration keeps the chapter playable until its first new segment replaces the old one.
   - After a cancel or failure with audio, the chapter stays playable, and the player ends at the available audio with F1's "Narration paused" state.
   - Keep `status` for the progress UI.
4. **P1-3, stale translations.**
   - Store the language of each translation: a nullable column `sentences.translated_lang` in `0005`, backfilled from `series.target_lang` where `translated` is not null.
   - Changing a series' target language clears its stored translations and their translate jobs in the same transaction.
   - Narrate computes the spoken language per sentence. A sentence whose translation language doesn't match the target is re-translated, or skipped with a clear failure. Never speak the wrong language.
   - `assertNarratorSpeaks` must not be skipped when `spokenLang` is null: fall back to the source language.
5. **P1-4, the ledger never records a fake $0.**
   - An unknown cost is stored as `null` and shown as "unknown" in usage. Ask and Vocab use the same recorder.
   - A failed `chatJson` repair keeps the first call's usage.
   - Fill `generation_id` everywhere.
   - The estimate becomes a typed `unknown` state (`EstimateLine.usd: number | null` plus the reason); update F2's `isEstimateUnknown` in `src/features/shared/estimate-price.ts` to read it.
6. **P1-5, low storage.**
   - Map write errors (ENOSPC, "No space left", and the Expo FileSystem error codes) to `STORAGE_FULL`, retryable after space is freed, with the copy "Your phone is out of storage. Free up some space, then tap Try again."
   - Preflight before narrate: if free space is below the estimated audio size plus 200 MB, fail with the same code before spending.
7. **P1-6, uncapped selection prompt.** Pre-filter the blocks by score and cap them at a token budget (chunk it if needed). Map context-length 400s to a clear message: "This page is too large to read. Try the article's own link or a PDF."
8. **P2-1, delete stops the run.** Deleting a chapter or series cancels its runs and waits for the queue to settle (with a timeout) before deleting rows and files. Queued ids are removed. Test that no ledger insert fails on the foreign key.
9. **P2-2, keep paid passages.** On a narrate failure or cancel, save every finished passage in index order, even after a gap.
   - Resume reuses passages by **input hash**, not by prefix: re-synthesize only the missing or stale indices.
   - Port the repro: passages 1–3 finish, passage 0 fails → after the failure, 1–3 are saved, and a retry synthesizes only 0.
10. **P2-3, translation and analysis siblings.**
    - On the first failure, abort the sibling chunks through an internal AbortController.
    - Persist translation chunk results as they complete, keyed by (input hash, model, prompt version). The `chunk_cache` table goes in `0005`. A retry reuses finished chunks. Analysis uses the same cache.
11. **Small fixes:**
    - P2-5: detect scanned PDFs per page if the parser gives pages; otherwise fix the comment and add a test.
    - P2-6: the page-number filter applies only at page edges.
    - P2-8: re-analysis deletes the chapter's facts before inserting.
    - P2-9: the delete copy mentions saved words, bookmarks and questions (vocab stays cascade).
    - P2-10: surface queue persistence failures (a toast plus a retry on the next change).
    - P2-11: `max_tokens` per stage, from the chunk size (2× the expected output).
    - P3-1: clear `draining` synchronously.
    - P3-2: reconcile running jobs in `restore()`, and fix Diagnostics' pending count.
    - P3-4/P3-5: delete orphan cover and picker copies.
    - P3-6: atomic writes (temp file, then move).
    - P3-7: a startup orphan-file sweep, idle and throttled.
    - P3-9: read the chapter record once per run, and upsert the profile only on change.
    - P3-11: hash the stored-translation state into the translate job.
12. **Content notice gate (architect decision, from F2):** Add Chapter must show the content notice and require acceptance before the first import, when `contentNoticeAccepted` is false (after onboarding Skip). Reuse onboarding's notice component in a sheet.

## Out of scope
- FTS changes.
- Spend reconciliation via the generation endpoint (needs extra paid calls).
- iOS relative paths (P3-8): note it.
- A4 paths: `scripts/sounds/**`, `assets/**`, `src/core/analysis/ambience-taxonomy.ts`, `src/core/playback/resolve-bed.ts`, `src/audio/ambience-pack.ts`. The analysis cache wiring may touch `src/core/analysis/map-reduce.ts` and `src/core/pipeline/stages/analyze.ts`: A4 has edited `map-reduce.ts`, so read the current file and keep its changes.

## Tests
Every item gets a regression test. Mutation-check P1-1, P1-2, P1-3, P1-4 (no $0) and P2-2. Run the migration test pattern from `listening-model-migration.test.ts` for `0005`: seed, migrate, assert the backfills.

## Constraints
No `npm install`, no commits, no real API calls.

## Acceptance
`npm run verify` is green (paste the tail). If it fails only in A4's `sounds:verify`, say so and show everything else is green.
