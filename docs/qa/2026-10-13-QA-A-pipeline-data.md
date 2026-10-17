# QA-A: Pipeline, data and network (2026-10-13)

_Read-only audit by a haiku-worker (brief Q1). Line numbers are at HEAD b93026e. The architect spot-verified P1-1 (`codex.ts` prints `entity.aliases` with no cutoff, and `entities.ts` pushes aliases without a chapter stamp) and P1-2 (the runner sets `processing`, `draft` and `failed`, and only `ready` counts as playable in `series-data.ts:57` and `playback-data.ts:30`). The worker reproduced P1-1 and P2-2 with scripts outside the repo._

## P0
1. **Unbounded memory on large PDFs and pages:**
   - The PDF picker has no size cap, and `readBase64` loads the whole file. It is embedded as a data URL in the JSON body.
   - The fetcher fallback calls `arrayBuffer()` with no cap when there is no Content-Length.
   - Fix: refuse PDFs over 25 MB (S); cap streamed bodies (M).

## P1
1. **Spoiler leak through aliases** (verified): an alias revealed in chapter 9 shows at cutoff 3 ("Jon (also: The Prince)"). The same data feeds analysis context and alias matching. Fix: chapter-stamped aliases (`entity_aliases(..., first_chapter_order)`), filtered by cutoff, plus a backfill and a regression test. M.
2. **Status enum decides playability** (verified):
   - During renarration the chapter drops out of Play, Continue and auto-advance.
   - After a cancel (`draft`) or failure, valid audio becomes unplayable, and the player waits forever (`final: false`).

   Fix: derive "playable" from the stored segments and the narrate job. M.
3. **Changing the target language leaves stale translations**: translate skips without clearing them, so narrate reads the old-language text with the new voice. With `spokenLang` null, the language guard is skipped. Fix: store the language per translation, or clear in the same transaction; compute the spoken language per sentence. M.
4. **The usage ledger undercounts:**
   - Speech cost is always null, and when the catalog fails it is recorded as **$0** for good.
   - Ask and Vocab use `?? 0`.
   - A failed `chatJson` repair drops the first call's usage.
   - Retries of possibly-billed attempts are not recorded.
   - `generationId` is never written.

   Fix: store null with "unknown", one shared recorder, keep usage from failed attempts (S); reconcile by generation id (M).
5. **Low storage is unhandled**: `STORAGE_FULL` is never produced, write errors become generic "Something went wrong", and there is no free-space preflight. S-M.
6. **The block-selection prompt is uncapped**: a noisy 5 MB page can overflow the context, and the 400 becomes a non-retryable `UNKNOWN`. Fix: chunk or pre-filter, and give clear copy. M.

## P2
1. **Deleting a chapter or series doesn't stop its run**: the ledger insert then fails on the foreign key and the spend is lost; queued ids fail later. Fix: cancel and wait for idle before deleting. S.
2. **A failed or cancelled narration discards finished paid passages** (verified): the ordered pool drops the results it hasn't delivered yet. Fix: on failure, save every finished passage in index order, and handle gaps in resume. M.
3. **Analysis and translation are all-or-nothing**: a failure on the last chunk discards the paid chunks, and translation siblings keep running after a failure. Fix: per-chunk checkpoints, and abort siblings. M.
4. **The retry budget can hold a passage for about 12.5 min** (4 × 180 s plus backoff) and may double-bill timeouts. Fix: a separate speech retry policy (coordinate with N3). S.
5. **Scanned-PDF detection is per document**, not per page (the parser returns one "page"). M.
6. **The PDF furniture filter deletes standalone numbers anywhere** (verse and list numbers). Fix: test only at page edges. S.
7. **The WebView HTML has no size cap.** S.
8. **Re-analysis accumulates stale entity facts.** Fix: delete the chapter's facts before inserting. S-M.
9. **Vocab and Q&A are deleted silently with their chapter or series.** The copy should say so, or vocab should be kept (product decision).
10. **Queue persistence failures are swallowed.** S.
11. **No `max_tokens` on paid chat calls.** Fix: a budget per stage. S.

## P3
- A queue drain race (hypothesis).
- Running jobs aren't reconciled after a kill, and the Diagnostics `pending` count always reads 0.
- The ledger total scans the whole table.
- Orphan cover copies.
- Picker cache copies are never deleted.
- File writes aren't atomic.
- No sweep for orphan files.
- Absolute `file://` URIs (an iOS risk).
- The chapter record is reloaded per stage, and the profile is upserted 6× per run.
- Dead code: `cue-repo.insert`, `narration-profile-repo.get`, `voicesFor`, `cost.ts`.
- Re-segmenting would wipe translations silently (latent).
- "Run OCR" copy.

## Checked and fine
- BYOK: SecureStore, redacted everywhere, not logged.
- The search cutoff is applied in SQL.
- The furthest position only moves forward.
- The resume hash covers text, voice, style and speed.
- The WebView is sandboxed.
- FTS triggers.

## Bigger jumps
1. Durable per-chunk and per-passage checkpoints. M-L.
2. Spend reconciliation against OpenRouter by generation id. M-L.
3. A time-stamped knowledge model (every fact, alias and identity with its chapter). L.
4. Playability derived from state, not a status enum. M.
5. A storage model: relative paths, a size per series, retention, cleanup. M-L.
6. Background-safe narration: already approved as N4.
7. Gapless MP3 seams (trim encoder padding and Xing frames). M-L.
