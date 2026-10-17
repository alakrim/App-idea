# Brief FX-F: Never pay twice, never lose data (fix wave for QA-F)

**Type**: fix wave. **Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/qa/2026-10-17-QA-F-pipeline-data-cost.md` (findings, proofs, the hypotheses), `docs/archive/F3-data-integrity-fixes-from-charming-fermat.md`, ADR-0001 (BYOK), ADR-0007, ADR-0008, and the code each finding cites.

## Why
The user pays for every OpenRouter call with their own key, and has said the Gemini narration is already expensive. QA-F found several paths that **bill twice or throw away paid work**, plus user-visible data bugs. In order of the money each one wastes:

## Scope (in order; each finding gets its proof flipped on, or a new regression test, plus a mutation check)
1. **F-01**: a retired attempt whose reply has already arrived is sent again.
   - Retirement (N3) must only re-send when **no response has started**.
   - Once headers or a body have arrived, keep reading that body, or fail it as a normal error that the queue backs off.
   - Re-read `src/services/openrouter/stale.test.ts` (the 8 N3 tests). Keep their intent, and adjust only where they encode the double-send.
2. **F-06, a content-addressed narration cache: never re-buy identical audio.**
   - Reuse a stored segment whenever a planned segment's **hash** (text, model, voice, style, speed) matches **any** stored segment of the chapter, not only at the same index.
   - Rename or re-index the files instead of deleting them. Delete only files no longer referenced, after the new plan is saved.
   - This also covers an app update that changes the segment plan (ramp, split sizes).
   - Test: replan a finished chapter with a different ramp, and expect **0** speech calls for unchanged text.
   - Test: change one sentence, and expect only the affected segments to be re-synthesized.
3. **F-05**: finished passages behind a failure or cancel are dropped. The TTS window must save **every completed** segment, in order where possible, but never discard paid audio.
   - Persist completed out-of-order segments, so they are reused by hash on resume through item 2.
   - The player still sees only the contiguous prefix.
   - Flip on the proof `tts-pool-gap.audit.test.ts`.
4. **F-02**: one failed analysis chunk discards all paid chunks.
   - Checkpoint each analysis chunk result, persisted per chapter and chunk hash, so a retry reuses the finished chunks.
   - Flip on the proof `map-reduce-retry.audit.test.ts`.
5. **F-11**: retry budgets multiply (transport × pool). Use one retry budget per paid request across layers, and record paid retries in the ledger.
6. **F-04**: an unknown cost is stored as `$0`.
   - Store `null` (unknown) and `generationId`, and show "unknown" honestly in usage.
   - Optional: resolve the cost later via the generation endpoint. That needs a key at runtime, which the app has; it is not a test-time call.
   - Ask and Vocab must not use `?? 0`.
   - Flip on the proof `meter-unknown-cost.audit.test.ts`.
7. **F-03**: an alias first revealed in a later chapter leaks into Ask at an earlier cutoff. This is a spoiler bug. Flip on the proof `codex-alias.audit.test.ts`.
8. **F-07**: playability. A chapter with contiguous audio from the start is playable whatever its status (cancelled, failed or waiting). Align this with F2's `playable`.
9. **F-08**: store the translation's target language per chapter. When the series language changes, mark the translation stale, and the UI says so. Write the repro as a test first.
10. **F-09**: storage.
    - Map ENOSPC and "no space" errors to a `STORAGE_FULL` error code with a clear message: "Your phone is out of space. Free some space, then retry."
    - Before narrating, check free space against the estimated size of the narration (WAV is about 170 MB/h), and refuse early with the same message.
11. **F-10**: PDFs.
    - Add a 25 MB cap with a clear message before reading.
    - Stream or chunk the base64 conversion if possible. If not, the cap is the fix.
12. **F-12**: queue persistence failures are swallowed. Surface them (Diagnostics and a log), and retry the save.
13. **F-13**: deleting a chapter or series cancels its run first, then deletes. Test that no FK errors occur and no orphan files remain.
14. **F-14**: cap the WebView HTML size, the same as the fetcher cap. **F-15**: a context-length 400 gets its own error code and copy ("This chapter is too long for the chosen model…").
15. **P3s, if budget allows**:
    - F-16: a stalled run's job leaves `running`.
    - F-17: don't persist `force` into retries.
    - F-18: an orphan-file sweep at startup, and atomic writes (write to temp, then rename).
    - F-19: re-kick the queue after the final microtask.
    - List any you skip.

## Verification
- Every proof passes and moves out of `*.audit.test.ts` into the regular suite. Mutation-check each P1 fix: revert it and confirm its test fails.
- `npm run verify` is green. `npm run contract:check` passes.
- Your report includes a device checklist covering H-1, H-4, H-8 and H-6 from the audit, in plain words for the user.

## Constraints
- No new dependencies. No paid calls.
- Don't touch `src/audio/**` or `src/features/player/**` (FX-E is fixing those in parallel). Don't touch `src/features/diagnostics/**`, except adding one row for queue-save failures (FX-E adds a card there; keep the edits small to avoid conflicts).
- DB changes: add a new migration **0006** (drizzle-kit), keep it idempotent like 0005, and update `bundled-migrations.ts` and the upgrade-path test.
- Work in your worktree. If `node_modules` is missing, `ln -s /home/user/App-idea/node_modules node_modules`.
- Commit with your harness Co-Authored-By trailer plus `Claude-Session: https://claude.ai/code/session_016sqBEw3paK5QXmP6QkprQ9`. Do not push.
- Context budget: at about 220k tokens (about 150 tool calls), stop at a committed checkpoint, write `docs/briefs/FX-F-handoff.md` with exactly which items are done, and report.
