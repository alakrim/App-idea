# Brief F1: Progressive narration core (first audio in seconds, not minutes)

**Type**: implementation (core pipeline + text chunking + services progress). The player UX is brief F2, later.

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md`, **ADR-0008** (the contract), `src/core/pipeline/{runner,context,ports,job-records,meter,hash,errors}.ts`, `src/core/pipeline/stages/*.ts`, `src/core/translate/*`, `src/core/text/chunk.ts`, `src/core/narration/options.ts`, `src/services/pipeline/{progress,facade}.ts`, `src/features/player/playback-controller.ts` (read only: how it appends segments while narrating), and the e2e test `src/services/pipeline/e2e.test.ts`.

## Why
A 40-minute chapter keeps the user waiting a long time:
- Stages run strictly one after another: extract → segment → analyze → translate → narrate.
- Narration runs in **lock-step pairs**: each pair waits for its slower request.
- Nothing is playable until analysis and translation of the whole chapter are done.

The architect's sizing: a 40-min Latin chapter is about 22k characters, so about 37 Gemini segments of 600 chars. In lock-step pairs at roughly 10–20 s per request, that is 3–6 min of narrate alone, plus the analysis call (20–60 s) and translation before it.

## Scope
1. **Adaptive TTS pool** (`src/core/pipeline/tts-pool.ts`, pure, injectable clock):
   - A sliding window replaces the pairs. Start at 4 in flight. Add 1 after 4 consecutive successes, up to 8. Halve (minimum 1) on RATE_LIMITED or overload/5xx. The curated free narrator (`:free`) is pinned to 1 in flight.
   - Results may arrive out of order, but **segments are saved and `segmentReady` is emitted strictly in index order**. A finished segment waits in memory until its predecessors are saved.
   - A failure aborts the in-flight siblings (sharing the stage signal) and surfaces the first error. Already-saved segments stay, so resume starts at the first missing one (existing behaviour).
   - This fixes the known orphan-file issue (a pair with one failure) by construction. Prove it in a test.
2. **Ramped segment plan** (`planTtsSegments` or a wrapper in core/text or core/narration):
   - The first segment is about 200 chars, cut at sentence boundaries: at least one sentence, and never more than the narrator's max. The second is about 400. Then the narrator's `segmentMaxChars`.
   - The plan stays deterministic for a given text and narrator, so the per-segment hashes keep resume correct.
   - Test it on Latin, CJK and very long single sentences.
3. **Analysis off the critical path** (runner):
   - After extract and segment, run **analyze concurrently** with the translate → narrate chain.
   - Job rows stay one per stage, with their own statuses and progress.
   - The chapter becomes `ready` only when all three succeed. Any failure follows today's semantics: the first error wins, and the others are aborted via a shared signal.
   - Cancellation aborts all three.
   - Cue and memory results land in the DB whenever analysis finishes. Emit an `analysisReady` event so the player (F2) can pick up cues live.
4. **Streaming translate → narrate**:
   - Translation persists results **chunk by chunk in reading order**, and may run up to 2 chunks concurrently while persisting in order.
   - Narration consumes sentences as soon as their spoken text is final (translated, or the original when no translation is needed). A segment is synthesized only once **all** its sentences are final, and the ramp plan is computed over the final text of the sentences available, so the segments never change after synthesis. Design this carefully and document the invariant in code.
   - **The glossary dependency**: translation uses a glossary that includes the current chapter's memory (from analysis). Rule:
     - The **first window** (about the first 90 s of narration, ~1,000 Latin chars or ~250 CJK chars) is translated immediately, using a glossary from prior chapters and series entities only. Its prompt instructs keeping proper nouns as in the source, transliterated only when the script differs.
     - The rest of the chapter waits for analysis and uses the full glossary.
     - When there is no translation, narration starts right after segment.
     - Document the trade-off in ADR-0008 under "Consequences" (one short bullet).
   - Job inputHash semantics must keep "skip when done with the same input". Compute narrate's job hash from the final plan when the stage completes, and keep per-segment hashes for resume. Prove with tests that a rerun after completion makes no TTS call, and that a voice change re-synthesizes everything.
5. **Progress and ETA** (`src/services/pipeline/progress.ts`):
   - Add `playable: boolean` (the first segment is ready) and `etaMs: number | null`. The ETA is an EWMA of the observed seconds per character per in-flight slot, times the remaining characters. Null until 2 segments are done.
   - Add `narratedMs` (the audio duration ready) and `estimatedTotalMs`.
   - Emit a `playable` event once per run.
6. **Tests** (fake TTS with controllable latency and failure, fake clock):
   - order preservation under out-of-order completion
   - AIMD behaviour
   - the free narrator pinned to 1
   - the failure mid-window leaves no orphan
   - the ramp plan
   - analysis concurrency: narrate starts before analysis finishes when there is no translation
   - the translation first window then waits for analysis
   - cancel aborts all
   - resume after a failure re-buys nothing
   - progress/ETA math
   - update the e2e scenarios so they pass unchanged in spirit
   - a **benchmark test**: a simulated 40-min chapter (fake TTS 12 s per request, analysis 40 s). Print time-to-first-audio and total time, before (the old algorithm, computed analytically or with a test-only flag) and after. Paste the numbers in your report.

## Constraints
- No real API calls, no new dependencies. Don't touch `src/core/pipeline/queue.ts` (brief BG1 is changing it), `src/core/analysis/**` except calling it (brief AM1 is changing it), `src/features/**` (except type fixes forced by new progress fields; list them), `modules/**`, `plugins/**`, `app.config.ts` or `assets/**`.
- You are in a git worktree. Before anything, run `ln -s /home/user/App-idea/node_modules node_modules` if `node_modules` is missing. **Commit** on your worktree branch when `npm run verify` is green, and report the branch and SHA.
- Update `docs/STATE.md` only by adding a short "F1" line under "Work in flight".
