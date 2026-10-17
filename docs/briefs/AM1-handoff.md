# AM1 handoff (paused snapshot, unverified as a final build)

**Branch**: `worktree-agent-abfdfc00ef800c3f4`
**Status**: implementation complete, paused by the architect before the final verify was read.

## Done
- **Deterministic calls**: `LlmRequest` gains `temperature` and `seed`. `llm-port` forwards them. `chatRaw` sends them in the body (`chat-raw.test.ts`, `llm-port.test.ts`). Every analysis call (chunk, repair, summary reduce, fallback) sends `ANALYSIS_SAMPLING` (`temperature: 0`, `seed: 1017`).
- **Thresholds** (ADR-0005 amendment): `confidenceFloor` 0.45, `maxPer1kWords` 3. `minSentences` 3 and `minSeconds` 12 unchanged. Pinned in `limits.test.ts`.
- **Prompt v3** (`PROMPT_VERSION = 'analysis-v3'`): setting-coverage policy, coverage target 40–80 %, cues-decided note for cache hits. Snapshot regenerated and reviewed. `COVERAGE_GOAL_PERCENT` in `limits.ts`.
- **Single-bed fallback**: `setting-fallback.ts`. Runs once when a chapter of at least 200 words ends with zero valid cues. Input is the chapter summary, key events and places (not the text). Its bed spans the whole chapter and is validated with `validateCues`. Schema `setting_fallback`, strict.
- **Cue cache**: `cue-cache.ts` (`cueCacheKey` = `stableHash(['cues', PROMPT_VERSION, model, texts])`). Table `ambience_cue_cache`, migration `0003_ambience_cue_cache.sql` (drizzle-generated, bundled, journal test passes). On a hit the analysis asks for memory only, uses the cached cues, makes no fallback call.
- **Cue report**: `cue-report.ts`. Table `ambience_reports`, one row per chapter. Holds counts by drop reason, accepted, coverage %, fallbackRan, fromCache, model, prompt version, timestamp. No model text is stored.
- **UI**: Diagnostics "Last analysis" card (`last-analysis-card.tsx`, shared `value-row.tsx`). Chapter ambience list shows "No ambience: no clear setting found" once analysed and empty.
- **Tests added**: setting-fallback, map-reduce-cues (fallback, cache, sampling), cue-report, cue-cache, limits, analyze stage e2e (two runs over identical text give identical cues, second run makes no cue call), cue-cache-repo, ambience-report-repo, last-analysis-card, ambience-list, llm-port.
- **Mutation check** (reverted): disabling the cache hit or the sampling makes 3 tests fail.

## Evidence
- Full `npm run verify` (first run, before two cosmetic/structural edits in `map-reduce.ts` and prettier on `analyze.ts`): `VERIFY_EXIT=0`, 193 suites, 1804 tests passed, bundle exported (3224 modules).
- After those edits: `npm run typecheck` exit 0. Final full verify was still running (log `scratchpad/verify2.txt`, last seen in lint then tests). Its result is not recorded here.

## Remaining
1. Read the final verify result (`VERIFY_EXIT` line in `verify2.txt`). If it is not 0, fix and re-run.
2. Architect review of the design: cache-hit memory call still runs (cost is the same input tokens, output has `cues: []`).
3. Device listening test (S1 gate).

## Open issues
- **Coverage vs density cap**: 40–80 % coverage with at most 3 cues per 1,000 words and a 12 s minimum forces long cue spans. The validator does not enforce coverage; the report shows it. Architect to judge.
- **Seed determinism is not guaranteed by providers.** Reproducibility on re-upload comes from the cache, not from the model.
- **Cost preview** (`core/pipeline/estimate.ts`) does not include the conditional fallback call. Its worst case is one small extra call.
- **Cache has no eviction.** One small row per distinct text × model × prompt version.
- **Cache-hit reports show zero drop counts** (the originals are not stored), with `fromCache: true`.
- **Fallback invalid reply** yields no cue, with no repair retry. That deviates from the one-repair convention, on purpose: the fallback is optional and must not fail the analysis.
- **Existing chapters** re-analyse once after the prompt bump (`PROMPT_VERSION` changes the analyze `inputHash`).
- **No UI to re-roll cues.** `force` re-runs reuse the cache.
- **Untracked symlink**: `node_modules` in the worktree is an untracked symlink to the main checkout. It must not be committed. This commit adds explicit paths only.
- **Pre-existing prettier drift** in untouched files (`use-sentence-focus.ts`, `playback-repo.ts`, several diagnostics tests, `narrator-requests.test.ts`, `audio-segment-repo.test.ts`, `use-sentence-scroll.test.ts`, `0002_snapshot.json`). Not from AM1, not fixed.

## Next steps
1. Confirm `verify2.txt` ends with `VERIFY_EXIT=0`, or fix what it reports.
2. Architect review of the design decisions above.
3. Decide the open issues: coverage policy, cost preview, cache eviction.
4. Device listening test, then merge.
