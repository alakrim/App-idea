# F1 handoff: paused snapshot (unverified)

Branch: worktree-agent-ae20f0e270d30d60c. Status: **partial, does not typecheck, no tests run for the new modules except as noted.**

## Done (written, unit-tested where noted)
- `src/core/text/chunk.ts`: `ramp` option on `planTtsSegments`, `NARRATION_RAMP_CHARS = [200, 400]`. Prefix-stable. Tests in `chunk.test.ts` pass (31/31).
- `src/core/pipeline/abort.ts`: `untilSettled`, `delay`. Abort rejects with `LlmCancelledError`. Tested via pool tests.
- `src/core/pipeline/tts-pool.ts`: `AdaptiveWindow` (4 start, +1 after 4 successes, max 8, halve on congestion, min 1, `pinned`), `isCongestion`, `backoffMs`, `SlidingWindow` (submit/finish; saves strictly in order; a failure aborts siblings and blocks saves; congestion retries up to 4 with backoff). `tts-pool.test.ts`: 22/22 pass.
- `src/core/translate/translate-chapter.ts`: rewritten. New inputs `translated` (prefilled final), `range` (inclusive idx), `onCommit` (called in reading order via `OrderedCommits`). Concurrency still supported. The existing translate-chapter tests were NOT re-run after the rewrite.
- `src/core/translate/first-window.ts`: `firstWindowEnd` (about 90 s of target-language speech). No tests yet.
- `src/core/pipeline/spoken-text.ts`: `SpokenTextGate` (publish, prefix, complete, estimatedChars, waitForChange). No tests yet.
- `src/core/pipeline/context.ts`: new events `playable`, `analysisReady`, `spokenChars`; `SegmentReady` gains `chars` and `synthesis`; `StageOptions.force`; `StageContext.spoken` and `analysisDone`; `PreparedStage.inputHash: string | null`, `settled`, `execute` returns `StageExecution | void`.
- `src/core/pipeline/stages/translate.ts`: rewritten. Opening window with the prior glossary, then `await analysisDone`, then the rest with the full glossary. Commits persist (`setTranslations`) and publish to the gate. Resume prefill from stored translations when the input hash matches. `settled` is set for skip and done-with-same-hash.
- `src/core/pipeline/stages/narrate-plan.ts`: pure plan. `planFinalSegments` (all groups but the last while incomplete), `joinSpoken`. Per-segment hash is unchanged (`[text, provider, model, voice, style, speed]`), so existing rows stay valid.
- `src/core/pipeline/stages/narrate.ts`: rewritten as a streaming loop. Reuses saved prefix segments (no TTS call), submits the rest to `SlidingWindow`, emits `segmentReady` for reused and new segments, `playable` on idx 0, `spokenChars`, progress = saved chars / estimate. Returns `status: 'skipped'` when nothing was synthesized, else `'done'`, with the hash of the final plan.

## Invariant (streaming translate to narrate)
A sentence is published to `SpokenTextGate` only once its final text is known. Publishing the same sentence again with different text throws. Narration plans over the contiguous final prefix and synthesizes segment k only when k is closed by a later sentence, or when the gate is complete. Planning is prefix-stable (chunk.ts test), so a segment never changes after synthesis. Translation commits in reading order. The gate is complete when translation is skipped (`settled` published by the runner) or done with the same hash.

## Trade-offs to document (ADR-0008 Consequences, not yet written)
- The opening window uses a prior-only glossary. Names first seen in this chapter may be rendered differently in the first ~90 s.
- The last segment of the window waits for the first post-window chunk, which waits for analysis.
- Translation chunks run 2 at a time, so a chunk may not see its immediate predecessor's translation as context ("translation pending").
- CJK: the ramp is in characters, so a 200-Han-character first segment is about 80 s of audio. Consider scaling the ramp by script.

## Not done / known broken right now
1. `src/core/pipeline/runner.ts` is still the OLD sequential runner. It does not provide `spoken`, `analysisDone`, `force`, or the new `StageExecution` handling. Typecheck fails until it is rewritten. Planned design: run extract and segment in order; create `SpokenTextGate` from stored sentences; run analyze in parallel with translate and narrate; `resolve analysisDone` on analyze ok or skip; publish `prepared.settled` when translate skips; if translate is not in the run (`from` > translate), publish `settled ?? stored translated-or-text`; first failure is recorded synchronously before any await, then the shared abort fires; siblings that observe a failure write `cancelled` silently; user cancel emits `error CANCELLED` once; `narrate` with `inputHash: null` writes `running`, then the `StageExecution` status.
2. `src/core/pipeline/stages/index.ts` must keep exporting `STAGE_DEFINITIONS`/`STAGE_ORDER` and expose the named stage definitions for the runner.
3. `src/core/pipeline/__fixtures__/fake-ports.ts`: `setTranslations` must only update the given idx (the real adapter already does), not replace all rows. Pass the `force` option in the fake too.
4. `src/core/pipeline/stages/narrate.test.ts`: the "free narrator sends up to 1,800 chars in one request" test is invalid under the ramp (200, 400, then 1800). Update it.
5. `src/core/pipeline/runner.test.ts`: `stageStatuses` ordering assumes sequential stages. Compare per-stage statuses instead. Also the progressive-stream test is still expected to pass.
6. `src/services/pipeline/progress.ts`: add `playable`, `etaMs`, `narratedMs`, `estimatedTotalMs`; handle the new event types (`playable`, `analysisReady`, `spokenChars`) in the reducer; EWMA of seconds per char per slot (alpha 0.3, null until 2 synth samples); narratedMs and chars from `segments` map; a `cancelled` stage must not override a `failed` chapter state. Tests in `progress.test.ts`.
7. `src/services/pipeline/facade.ts`: seed the new `TrackedChapter` fields. `src/features/pipeline/facade.ts`: add the 4 fields to `ChapterProgress`, then fix literal fixtures (fake-facade, screen-fixtures, playback-fixtures, chapter-status tests).
8. `src/services/pipeline/e2e.test.ts`: `describeEvent` switch needs the new event types. Check window-based cancel expectations (`finished == [0,1]`), which depend on the ramp.
9. Tests still to write: `spoken-text.test.ts`, `first-window.test.ts` (Latin, CJK), `narrate-plan.test.ts` (ramp, long sentence, prefix), translate streaming tests (window before analysis, rest after), runner tests (analysis concurrency: narrate starts before analysis resolves when there is no translation; cancel aborts all three; resume re-buys nothing), and the benchmark (40-min chapter, 12 s TTS, 40 s analysis, virtual clock; old TTFA analytic: 40 + 12 = 52 s, total 40 + 19 × 12 = 268 s).
10. `docs/STATE.md` F1 line under Work in flight. ADR-0008 Consequences bullet.

## Exact next steps
1. Rewrite `runner.ts` per item 1. Update `stages/index.ts`.
2. `npm run typecheck`, fix errors.
3. Progress reducer and facade (items 6 and 7).
4. Fixtures and tests (items 3, 4, 5, 8, 9).
5. Benchmark, then `npm run verify`, then commit with the required trailers.

## Test status
- Passing: `chunk.test.ts` (31), `tts-pool.test.ts` (22).
- Not run since the change: everything else. The pre-change baseline was 36 suites and 344 tests green (about 16 s for the targeted set).
