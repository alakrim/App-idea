# QA-F: Pipeline, network, data and cost (2026-10-17)

_Read-only audit under brief `docs/briefs/Q2-debug-audit.md` (QA-F). Code at HEAD `d8b351a` on the unified line. Proof tests are `*.audit.test.ts` files, excluded from `verify` by `AUDIT_PROOFS_IGNORE` in `jest.config.js`. Re-checks of the 2026-10-13 QA-A items are in the last section._

## Coverage so far / not yet audited
Audited in depth: the concurrent runner (`runner.ts`), the backoff queue (`queue.ts`, `retry-policy.ts`), the stall watchdog (`stall-watchdog.ts`), the network connection and heartbeat (`services/network/connection.ts`, `app-connection.ts`), the OpenRouter transport and chat client (`transport.ts`, `chat.ts`, `error-mapping.ts`, `speech.ts`), the cost meter (`meter.ts`, `core/llm/cost.ts`), the narrate stage and its window pool (`narrate.ts`, `tts-pool.ts`), the translate prefill and commit (`translate.ts`), the analysis stage and map-reduce (`analyze.ts`, `map-reduce.ts`), the codex and entity resolution (`codex.ts`, `entities.ts`), the delete flow (`series-service.ts`), and the facade's queue calls.

**Not yet audited** (budget): `narrate-fallback.ts` (split-and-join: each half is a paid request, so it is a money path, and it should be read next); `narrate-plan.ts` and `spoken-text.ts`; `translate-chapter.ts` internals beyond prefill and commit; `glossary.ts`; `estimate.ts` and the pre-spend preflight; `job-repo` and the job-store adapter; `usage-repo` and the ledger adapter; migrations `0000`–`0005` and `repair-schema.ts` (I3 edge cases); `chapter-repo` cascade; `audio.write` atomicity and orphan files; `memory-repo`; the OpenRouter `models`, `pdf` and `key` modules; QA-A P2-5, P2-6, P2-8, P2-9 and P2-11; the stall watchdog under real timers; the speech 400 format retry. The `core/extract` selection prompt (QA-A P1-6) is outside this scope.

## Contract check (keyless, live)
`npm run contract:check` at 2026-10-17T12:57:10Z: **31 OK, 0 FAIL of 31 checks.** Every model, endpoint and pricing line passed, including the structured-output checks for translate, analyze, cleanup and vocab, and the speech checks for all 9 narrators. No paid call was made.

The contract check cannot see the findings below. None of them concerns a provider contract, except F-11 (a 400-mapping gap), which the check does not cover.

## Summary

| ID | Severity | Title | Proof test |
|---|---|---|---|
| F-01 | P1 (money) | A retired attempt whose response has arrived is sent again, so the completion is billed twice | `transport-stale-retry.audit.test.ts` (fails) |
| F-02 | P1 (money) | A failed analysis chunk discards every paid chunk; the retry buys them all again | `map-reduce-retry.audit.test.ts` (fails) |
| F-03 | P1 (spoiler) | An alias first revealed in chapter 9 is printed at cutoff 3 | `codex-alias.audit.test.ts` (fails) |
| F-04 | P1 (ledger) | An unknown cost is recorded as $0, and no generation id is ever stored | `meter-unknown-cost.audit.test.ts` (fails) |
| F-05 | P1 (money) | Finished passages behind a failure or cancel are dropped, so resume buys them again | `tts-pool-gap.audit.test.ts` (fails) |
| F-06 | P1 (money) | Narration reuse stops at the first mismatch and deletes every later paid passage | not proven by a test (code-verified) |
| F-07 | P1 (user) | Playability comes from the `status` enum, so a cancelled chapter with audio drops out of Play | not proven by a test (code-verified) |
| F-08 | P1 (user) | No stored translation language (F3 P1-3 not landed), so the wrong language can reach the narrator | not proven by a test (code-verified) |
| F-09 | P1 (user) | Low storage: no `STORAGE_FULL` mapping and no free-space preflight | not proven by a test (code-verified) |
| F-10 | P1 (user) | No 25 MB PDF cap: the whole file is read as base64 and sent in one JSON body | not proven by a test (code-verified) |
| F-11 | P2 (money) | Retry budgets stack (transport 4 attempts × pool 4 on congestion), and paid retries are not recorded | not proven by a test |
| F-12 | P2 (data) | Queue persistence failures are swallowed, so a queued chapter can vanish on restart | not proven by a test |
| F-13 | P2 (data) | Deleting a chapter or series does not stop its run, so a live narration writes to deleted rows | not proven by a test |
| F-14 | P2 (data) | The WebView HTML has no size cap | not proven by a test |
| F-15 | P2 (copy) | A context-length 400 becomes a generic non-retryable UNKNOWN, with no "page too large" copy | not proven by a test |
| F-16 | P3 | A stalled run leaves its stage job row `running`, and the Diagnostics pending count is wrong | not proven by a test |
| F-17 | P3 | `force` is persisted in the queue and reused on every transient retry (latent; no caller sets it) | not proven by a test |
| F-18 | P3 | No orphan-file sweep, and file writes are not atomic | not proven by a test |
| F-19 | P3 (hypothesis) | An enqueue in the microtask after the drain's last check can be lost until the next kick | not proven by a test |

**P1 count: 10, of which 5 have a failing proof test.** The 5 proofs are `transport-stale-retry`, `map-reduce-retry`, `codex-alias`, `meter-unknown-cost` and `tts-pool-gap`. F-06 to F-10 are code-verified and carry device hypotheses (below).

## P1 findings

### F-01 A retired attempt whose response has arrived is sent again (money)
- **Reproduction path:** a chapter is narrating, translating or analysing. The phone freezes JS for more than 10 s (screen off, Doze, or a background stretch without the service), or the stall watchdog fires after 90 s plus the request timeout. A paid POST has already returned headers, and its body is being read. The connection retires it. The transport sees a stale connection and sends the same POST again. OpenRouter bills both completions. The ledger records one, because `CostMeter.transport` records only successful replies (`meter.ts:34`).
- **Evidence:**
  - `app-connection.ts:21`: `setInterval(() => connection.heartbeat(), HEARTBEAT_MS)`. The heartbeat is live, so the freeze path runs on device.
  - `connection.ts`, `retireWhere(entry.startedAt <= frozenAt)`, aborts an attempt whose reply may already be in the native buffer.
  - `transport.ts:174`: `retired = true;`. The attempt's abort is treated as stale.
  - `transport.ts:147`: `if (failure.stale) continue;`. The retry is immediate, uncapped, and not counted against `maxRetries`.
  - `runner.ts` `onStall`: `this.ports.network.retireInFlight()` on each stall below `MAX_STALLS`.
- **Root cause:** a retirement is meant to stop a dead socket, but it also aborts a live reply that is only being read. Nothing checks whether the reply has already been paid for.
- **Proof:** `src/services/openrouter/transport-stale-retry.audit.test.ts`. Expected: 1 request. Received: 2.
- **Proposed fix:** once the response headers have arrived, a retirement must not abort the body read. Retry only attempts that have sent no response. Cap stale retries. Record each billed attempt.
- **Note:** the existing `stale.test.ts` covers retirement. This proof covers the body-read case it does not exercise (I did not read that file in this audit).

### F-02 A failed analysis chunk discards every paid chunk (money)
- **Reproduction path:** a 3-chunk chapter. Chunk 3 hits a network drop, or returns two malformed replies (`LLM_INVALID_OUTPUT`, retryable). `analyzeChapter` throws. The finished chunk replies live only in its local `responses` array, so they are lost. The analysis job is `failed`, and the queue retries after backoff. The retry buys chunks 1 and 2 again.
- **Evidence:** `map-reduce.ts` `analyzeChapter`: `onResult` pushes into a local array, and no checkpoint is written. `analyze.ts` saves only at the end, through `saveCues` and `saveCueCache`. The schema has no `chunk_cache` table (F3 P2-3 for analysis is not landed). Translation is different: `translate.ts` persists each chunk through `onCommit`, so the translation retry reuses committed chunks.
- **Proof:** `src/core/analysis/map-reduce-retry.audit.test.ts`. Expected: 3 model calls across both runs. Received: 4.
- **Proposed fix:** a per-chunk checkpoint keyed by (input hash, model, prompt version), written as each chunk completes, as F3 P2-3 specifies. The retry reuses finished chunks.

### F-03 An alias first revealed in chapter 9 is printed at cutoff 3 (spoiler)
- **Reproduction path:** chapter 9 is analysed. `resolveEntities` pushes "The Prince" into Jon's alias list (`entities.ts:124`), with no chapter stamp. A reader at chapter 3 (Q&A or analysis prior context) gets `buildPriorContext`, which filters entities by `firstChapterOrder` (`codex.ts:96`) but prints every alias (`codex.ts:62`).
- **Same pattern:** `translate/glossary.ts:67` filters entities by first chapter, and the glossary prints `entity.aliases` (QA-A P1-1). I did not re-prove the glossary path here.
- **Proof:** `src/core/memory/codex-alias.audit.test.ts`. The positive control (Jon is visible) passes. The alias check fails: "The Prince" appears.
- **Proposed fix:** F3 P1-1. Add `entity_aliases(entity_id, alias, first_chapter_order)`, backfilled conservatively, and filter by cutoff in codex, glossary and matching. The schema has no `entity_aliases` table, so migration `0005` has not landed.

### F-04 An unknown cost is recorded as $0, and no generation id is stored (ledger)
- **Reproduction path:** a model that is not in the catalog, or a call whose reply has no `usage.cost`. The row is written with `costUsd: 0`, so the spend reads as free. Ask and Vocab do the same thing.
- **Evidence:**
  - `meter.ts:43-44`: `usage.costUsd ?? (model ? estimateChatCost(...) : 0)`.
  - `meter.ts:61`: `spec.costUsd ?? (model ? estimateSpeechCost(...) : 0)`.
  - `meter.ts:90`: `generationId: null`, always. The speech path reads `x-generation-id` (`speech.ts`) and drops it.
  - `ask-service.ts:222`: `costUsd: reply.usage.costUsd ?? 0`.
  - `vocab-actions.ts:127`: `costUsd: usage.costUsd ?? 0`.
  - `chat.ts` repair path: when the repair call fails, `chatJson` throws `LLM_INVALID_OUTPUT` without the first call's usage.
- **Proof:** `src/core/pipeline/meter-unknown-cost.audit.test.ts`. Expected: `null`. Received: `0`.
- **Proposed fix:** one shared recorder. Store `null` for an unknown cost, and show "unknown" in usage. Record the usage of failed attempts (F-11). Persist the generation id (F3 P1-4).

### F-05 Finished passages behind a failure or cancel are dropped (money)
- **Reproduction path:** passages 1 to 3 finish in the window, and passage 0 fails (or the user cancels). Nothing after the gap is saved. The retry synthesizes 1 to 3 again.
- **Evidence:** `tts-pool.ts:194`: `if (this.failure !== null) return;`. A finished passage waits in `this.finished`, and it is never saved once the pool has failed. The header comment says this is deliberate, to avoid orphan files. The F3 P2-2 requirement (save every finished passage, then reuse by hash) is not implemented.
- **Proof:** `src/core/pipeline/tts-pool-gap.audit.test.ts`. Expected: `[1, 2]` saved. Received: `[]`.
- **Proposed fix:** save every finished passage in index order, with its input hash. Resume reuses by hash and synthesizes only the missing or stale indices (F3 P2-2).

### F-06 Narration reuse stops at the first mismatch and deletes every later paid passage (money)
- **Reproduction path:** any change to passage k's planned text or to its hash (a retranslation, a changed normalization or abbreviation list in an app update, a changed segment limit, or a voice or style change, all of which are in the hash). The stage sets `reusing = false` and deletes every stored segment from index k onwards, before it synthesizes anything. Passages k to N are then bought again. If the mismatch is near the start, the whole chapter is re-bought.
- **Evidence:** `narrate.ts:186-187`: `reusing = false; if (existing.length > k) await chapters.deleteAudioFrom(ctx.chapterId, k);`. `matches()` compares `stored.inputHash === planned.hash`.
- **Proposed fix:** reuse by hash, not by prefix. Delete only the rows whose hash changed. This is F3 P2-2.
- **Device hypothesis H-4:** after an APK update over `ced9221`, narrate a finished chapter. Expect zero speech calls unless the spoken text changed.

### F-07 Playability comes from the status enum (user)
- **Reproduction path:** the user cancels a narration that has saved audio. `runner.ts` `recordError` sets the chapter to `draft`. Its audio is still on disk, but the chapter drops out of the Play and Continue lists.
- **Evidence:** `series-data.ts:79`: `chapters.filter((record) => record.chapter.status === 'ready')`. `chapter-status.ts:18` and `listen-now.ts:23` read `status` as well. A renarration sets `processing`, which hides the chapter the same way.
- **Proposed fix:** F3 P1-2. Derive playable (one saved segment, and no narrate run is producing the first segment) and complete from the stored segments and the narrate job. Keep `status` for progress only.

### F-08 No stored translation language (user)
- **Reproduction path:** the user changes the target language. The translate stage re-runs, because `sameInput` includes the target language (`translate.ts:108`), so prefill is empty. The gap: the `storedSpokenTexts` path (`runner.ts` `translating()`, the branch used when translate does not run) publishes whatever text the sentences hold. A narrate-only run after a language change can therefore read old-language text in the new voice.
- **Evidence:** `translated_lang` does not exist in the code (grep is empty). F3 P1-3 is not landed. `narrate.ts` skips `assertNarratorSpeaks` when the spoken language is null, which the F3 fallback only partly fixes.
- **Status:** code-verified. Not reproduced by a test. Needs a repro before a fix wave.

### F-09 Low storage (user)
- **Reproduction path:** the phone has under about 200 MB free. A narrate passage is written, and the write fails. The user sees the generic "Something went wrong. Try again." Retrying does not help until space is freed, and the copy never says so.
- **Evidence:** `STORAGE_FULL` appears only in `domain/pipeline.ts` and `features/chapter/failure-copy.ts`. No write error is mapped to it: there is no ENOSPC handling in `services/` or `services/pipeline/adapters`. No free-space call exists in `src/`, so there is no preflight.
- **Proposed fix:** F3 P1-5. Map write errors to `STORAGE_FULL`, retryable after space is freed, and preflight the estimated audio size plus 200 MB before any paid call.

### F-10 No PDF size cap (user)
- **Reproduction path:** the user picks a 60 MB scanned PDF. The whole file is read as base64, and the base64 is embedded as a data URL in one JSON body. On a mid-range Android device this can run the app out of memory.
- **Evidence:** `add-chapter-screen.tsx:253`: `size: asset.size ?? 0`. The size is stored and never checked. `openrouter/pdf.ts:46`: `data:application/pdf;base64,${input.base64}`. The streamed-body cap in `fetcher.ts` (lines 190–212) covers web pages only.
- **Proposed fix:** F3 P0-1. Refuse PDFs over 25 MB at pick time, with the copy "This PDF is 38 MB. Lectio can read PDFs up to 25 MB."
- **Device hypothesis H-7:** pick a 40 to 60 MB PDF and note the memory and any crash.

## P2 findings

### F-11 Retry budgets stack, and paid retries are not recorded (money)
- Speech: `client.ts:55` sets `maxRetries: 3`, so a timed-out passage gets up to 4 attempts at 180 s each (about 12 minutes; QA-A P2-4). Congestion (`UNKNOWN` with `retryable`, which includes 5xx and empty audio) is also retried by the pool up to 4 times. Each pool retry gets its own 4 transport attempts, so the worst case is 16 paid attempts for one passage.
- `chat.ts:114` runs `jsonBody(completionSchema)` as the transport reader, so a malformed 200 body is retried inside the transport as a paid call. `CostMeter.transport` records only successful replies, so those attempts are never recorded.
- **Fix:** a per-call retry policy for paid requests. Record every billed attempt, and cap the pool and transport budgets together (coordinate with N3).

### F-12 Queue persistence failures are swallowed (data)
- `facade.ts:259`: `queue.enqueue(chapterId, options).catch(() => undefined);`. `facade.ts:362`: `queue.cancel(chapterId).catch(() => undefined);`. `queue.ts` `retryNow` also swallows `persist()` failures. A failed save means the queue on disk does not match memory, and a queued chapter can vanish on restart. F3 P2-10 is open.
- **Fix:** surface the failure (a toast, plus a retry on the next change).

### F-13 Deleting does not stop the run (data)
- Reproduction path: the user deletes a chapter while it narrates. `series-service.ts:94` (`deleteChapter`) deletes the rows and the files, and it never calls `facade.cancel`. The run keeps writing audio files and ledger rows for a chapter that no longer exists. The ledger insert then fails on the foreign key, and the spend is lost. `deleteSeries` (`:85`) has the same gap.
- **Fix:** F3 P2-1. Cancel, wait for idle with a timeout, then delete the rows and the files.

### F-14 The WebView HTML has no size cap (data)
- `webview-script.ts:7` defines only `MAX_WAIT_MS`. The `FETCH_LIMITS` cap (`web-extract.ts:24`, 5 MB) applies to the fetch path only. Fix as F3 P2-7.

### F-15 A context-length 400 becomes a generic non-retryable UNKNOWN (copy)
- `error-mapping.ts:164`: a 400 that matches no pattern becomes `UNKNOWN`, retryable false, with "OpenRouter could not complete this request." Not retrying is the right behaviour. The copy is wrong, and the uncapped selection prompt in `core/extract/select.ts` (QA-A P1-6) is outside this scope. The fix needs a "page too large" message, and the cap belongs to the extract owner.

## P3 findings
- **F-16:** `runner.ts` `finish()`, on the stall branch, writes chapter status `failed` and the stage event, but it writes no job row. The stage's job stays `running` (F3 P3-2).
- **F-17 (latent):** `force` is persisted in the queue entry (`queue.ts` `optionsOf`) and reused on every transient retry. No non-test caller sets `force: true` today, so it is dormant. Fix the retry path before any caller sets it.
- **F-18:** no orphan-file sweep (F3 P3-7). File writes are not confirmed atomic (F3 P3-6, not verified in this audit).
- **F-19 (hypothesis):** `queue.ts` `kick()` returns while `draining` is set, and `draining` clears in a `.finally` microtask after `drain()` returns. An `enqueue` that lands in that window does not start a drain until the next kick, so the chapter stays pending. The window is tiny, and no test reproduces it.

## Concurrency question: runner, stall watchdog and queue backoff
- **Failure ordering is sound.** The first failure is recorded synchronously before any await (`recordError`, `this.failed`), so siblings are aborted and recorded as cancelled. A cancelled sibling is not counted as a failure. The translate and analysis siblings are aborted through the shared controller.
- **Stall and retry do not double-retry the chapter.** A stall that reaches `MAX_STALLS` finishes as `failed` with a retryable `NETWORK` error. The queue then waits once, with backoff. `stall-watchdog.start()` resets the stall count for each run, so a long outage cycles through 3 stalls and then backoff.
- **The real interplay is F-01.** A stall retires every in-flight request, and the transport re-sends each one at once with no cap. That re-buys any request whose reply had already arrived. This is the path to fix first.
- **Analysis and the stall path.** An analysis failure aborts translation and narration. Translation's committed chunks survive (`onCommit`), but analysis has no checkpoint (F-02).

## Re-check of the 2026-10-13 QA-A findings in this scope

| QA-A item | Status | Where |
|---|---|---|
| P0-1 PDF size cap | open | `add-chapter-screen.tsx:253` (F-10) |
| P0-1 streamed body cap (fetch) | fixed | `fetcher.ts:190-212` |
| P1-1 alias spoiler | open | `codex.ts:62`, `entities.ts:124` (F-03) |
| P1-2 playability from status | open | `series-data.ts:79` (F-07) |
| P1-3 stale translations | open | no `translated_lang` (F-08) |
| P1-4 ledger | open | `meter.ts:43, 61, 90`, `ask-service.ts:222`, `vocab-actions.ts:127` (F-04) |
| P1-5 low storage | open | no `STORAGE_FULL` mapping (F-09) |
| P1-6 uncapped selection prompt | open, out of scope | `core/extract/select.ts`; copy in F-15 |
| P2-1 delete stops run | open | `series-service.ts:94` (F-13) |
| P2-2 keep paid passages | open | `tts-pool.ts:194`, `narrate.ts:186` (F-05, F-06) |
| P2-3 analysis and translation checkpoints | partly fixed | translate: `onCommit`; analysis: open (F-02); sibling abort is in `runner.ts` |
| P2-4 retry budget | open | `client.ts:55` (F-11) |
| P2-5, P2-6, P2-8, P2-9, P2-11 | not verified | not in the audited path |
| P2-7 WebView cap | open | `webview-script.ts:7` (F-14) |
| P2-10 queue persistence | open | `facade.ts:259, 362` (F-12) |

## Hypotheses to check on device
- **H-1 (F-01, freeze):** background the app for 30 to 60 s during narration, with the service on. Return, and compare OpenRouter's activity count with the chapter's ledger rows. Extra generations after resume mean the freeze path re-bills.
- **H-2 (F-01, stall):** on a weak network, cut the connection for about 20 s during speech. Count generations against passages.
- **H-3 (F-02):** cut the connection near the end of analysis. Check whether early chunks are billed twice in the ledger.
- **H-4 (F-06):** install a new APK over `ced9221` and narrate a finished chapter. Expect zero speech calls unless the text changed.
- **H-5 (F-13):** delete a chapter during narration. Check the logs for foreign-key errors and the chapter's audio directory for orphans.
- **H-6 (F-09):** fill storage to under 200 MB, then narrate. Expect the generic error copy.
- **H-7 (F-10):** pick a 40 to 60 MB PDF and watch memory and any crash.
- **H-8 (F-05):** cancel with three or more passages in flight, resume, and count speech calls against passages already paid.
- **H-9 (F-19):** enqueue from a UI event during a drain's final tick. Low probability.
- **H-10 (storage growth):** check a one-hour narration's audio size. The brief cites about 170 MB/h for WAV. Not verified in this audit (`formats.ts` not read).

## Evidence

**Contract check**
```
OpenRouter contract check, live from https://openrouter.ai/api/v1 at 2026-10-17T12:57:10.271Z
...
31 OK, 0 FAIL of 31 checks
```

**Verify subset, run in the worktree after the change**
- `npm run typecheck`: `tsc --noEmit` with no errors.
- `npm run lint`: `eslint . --max-warnings 0`, no problems.
- `npm test`: `Test Suites: 276 passed, 276 total`, `Tests: 2561 passed, 2561 total`, `Snapshots: 2 passed, 2 total`, `Time: 37.382 s`. No `*.audit.test.ts` suite ran (count 0 in the log).

**Proof tests, run with the exclusion overridden** (`npx jest --testPathIgnorePatterns='/node_modules/' --testPathPattern 'audit\.test'`): 10 failed of 10. Each file runs in two projects, because the override removes every project's ignore list, so 5 files give 10 results. The failures are the expected assertions:
- `transport-stale-retry`: `expect(sent).toBe(1)`. Expected 1, received 2.
- `map-reduce-retry`: `expect(calls).toBe(3)`. Expected 3, received 4.
- `codex-alias`: `expect(prior).not.toContain('The Prince')`. The alias is present.
- `meter-unknown-cost`: `expect(entries[0]?.costUsd).toBeNull()`. Expected null, received 0.
- `tts-pool-gap`: `expect(saved).toEqual([1, 2])`. Expected `[1, 2]`, received `[]`.
