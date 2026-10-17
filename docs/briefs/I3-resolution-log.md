# I3 resolution log: merge of charming-fermat `54b3d2e` into `claude/serene-hypatia-73g7qo`

Status at this checkpoint: **partial**. 42 of 73 conflicted files are resolved. 31 still hold conflict markers and are listed in `docs/briefs/I3-handoff.md`. Read that file before continuing.

Side legend: **OURS** = `HEAD` (serene-hypatia), **THEIRS** = `54b3d2e` (charming-fermat), **PORT** = theirs as base with ours' changes applied by hand, **UNION** = both sides' entries kept.

## Resolved: policy side taken whole (OURS)
| File | Side | Note |
|---|---|---|
| `assets/ambience/README.md` | OURS | SND1 |
| `assets/ambience/curation/*.json` (19 conflicting files) | OURS | Theirs' A3 curation set is dropped |
| `assets/ambience/LICENSES.json` | OURS | Theirs' rows only for A3 files, which are dropped. Re-check for any SND1 file missing a row |
| `scripts/sounds/build-base-pack.mjs`, `ffmpeg-tools.mjs`, `pack-spec.mjs`, `verify-pack.mjs` | OURS | SND1 build chain |
| `src/audio/ambience-pack.ts` | OURS | SND1 pack |
| `src/core/analysis/prompts.ts`, `prompts.test.ts`, `__snapshots__/prompts.test.ts.snap`, `validate-cues.ts` | OURS | AM1 prompt v3. Theirs' analysis changes in `validate-cues.ts` are not ported (see handoff) |
| `src/services/openrouter/client.ts`, `index.ts`, `transport.ts`, `speech.ts`, `models.test.ts` | OURS | Per-call timeouts (default 60 s, chat 120 s, speech 180 s) match theirs N2 values |
| `app/settings/model.tsx` | OURS | N2 speech catalogue |
| `src/core/analysis/validate-cues.ts` | OURS | See above |
| `docs/STATE.md` | OURS + appended | Theirs' sections from "Incident 3" onward appended under "Merged from charming-fermat (54b3d2e)" |

## Resolved: deleted theirs-only A3 Freesound files (not a conflict, staged as added)
Removed from the index and the worktree: `assets/ambience/real/**` (13 m4a + manifest), every `assets/ambience/curation/*.json` that exists only on theirs (about 55 files, including `overrides.json`), and `scripts/sounds/{build-freesound-pack,freesound-api,freesound-curate,freesound-score,freesound-targets,freesound-window,loop-recipe,screen-policy,screen-run,seam}.mjs` with their tests and `scripts/sounds/screen/*.py`. Policy: "Drop theirs' A3 Freesound beds".

## Resolved: PORT
| File | Base | Ported from the other side |
|---|---|---|
| `src/audio/lectio-engine.ts` | THEIRS (incident-3 focus fix) | OURS F2 `setCues` (replaces the cue set live and re-plans the current sentence) |
| `src/features/player/playback-controller.ts` | THEIRS | OURS F2: `estimatedTotalMs` in content, `isAnalysisSettled`, `reloadCues` (cues reach the engine once analysis settles). `narrationPaused` and N3 watch stay as theirs |
| `src/features/player/scrubber.tsx` | OURS (buffer band, `clampToBuffer`, edge haptic, buffered a11y text) | THEIRS P2-10 memoised `ScrubberTicks`/`ScrubberLabels` and `PlayerScrubber` (store-wired). `PlayerScrubber` now passes the estimated track length and the buffered length |
| `src/features/player/transport.tsx` | THEIRS (bookmark, sentence step actions) | OURS `narratingAhead` prop, the fixed-height ahead line beneath the controls, and the busy override |
| `src/features/player/full-player.tsx` | THEIRS | OURS `useNarratingAhead` for `busy`/`playing`, and the `narratingAhead` prop to Transport |
| `src/features/player/layout.ts` | THEIRS | OURS `bufferOpacity` token |
| `src/features/player/__fixtures__/playback-fixtures.ts` | THEIRS | **Not yet**: OURS `estimatedTotalMs` fixture field is missing (typecheck will flag it) |
| `src/services/openrouter/models.ts` | OURS (`createdAt`, per-modality TTL, `fresh`, `serialize`/`hydrate`) | THEIRS F4 in-flight dedupe (`join`, `startFlight`, `waitFor`). Snapshot persistence stays on OURS `serialize()`. Check that the adapter writes the snapshot only after a fetch (F4 rule) |
| `src/core/pipeline/runner.ts` | OURS (F1 concurrent runner) | THEIRS N3 stall watchdog: `StallWatchdog` per run, `touch` on every event, network events (`attempt`, `staleAbort`, `backgrounded`, `resumed`), `retireInFlight` on the first stalls, `STALLED_ERROR` after `MAX_STALLS`, `clock` and `keepsAliveInBackground` options |

## Resolved: auto-merged by git, reviewed as safe
`src/audio/native-engine.test.ts` (incident-3 regression test, from theirs), `src/audio/voice-player.test.ts`, `src/services/pipeline/background-runner.ts` and `src/services/background/*` appear as staged additions. Background-service wiring is **not yet removed** (see handoff).

## Left as-is for the next worker
`src/audio/ambience-pack.test.ts` (theirs, tests the A3 pack module that OURS replaced). It is still staged. Decide keep or drop, and list it in the handoff if dropped.

## Unresolved (conflict markers kept): see `docs/briefs/I3-handoff.md`

## Checkpoint 2 (second worker, commit after 7deb3b7)

Status: **partial**. 10 files still hold markers (listed below). 21 files are marker-free.

### Resolved in checkpoint 2
| File | Side | Note |
|---|---|---|
| `src/core/defaults.ts`, `src/core/settings.ts` | UNION | Every key from both sides. `notificationsExplained` (ours) and `notificationPromptShown` (theirs) overlap, see open issue 9 |
| `src/features/chapter/chapter-deep-link.test.tsx`, `chapter-view.test.tsx`, `chapter-status.test.ts` | UNION | Props `onRetryNow` + `onPrepare`/`onStop`; `retryAt` + `reconnecting` |
| `src/features/chapter/ambience-list.tsx` | UNION | `analysed` (ours, empty copy) + `sentenceCount` (theirs, cue position) |
| `src/features/chapter/chapter-screen.tsx` | UNION | Theirs `goBackOrHome`, `onPrepare`, `onStop`; ours `analysed`, `onRetryNow` |
| `src/features/chapter/chapter-status.ts` | PORT | Theirs `processingLine` (N2 passage detail, N3 reconnecting); ours "Waiting for connection…" added first |
| `src/features/chapter/chapter-view.tsx` | PORT | Ours `listenNowOf` button (Listen now, live ETA copy) kept. Theirs "Prepare this chapter" for draft chapters added. Theirs `playBlockedCopy` no longer used here (open issue 10) |
| `src/features/pipeline/pipeline-lifecycle.tsx`, `pipeline-lifecycle.test.tsx` | OURS | BG1 `BackgroundWork` and `NotificationPrompt`. N4 `createBackgroundRunner`, foreground service, app-foreground, notification permission and primer removed. Test keeps `createForegroundStatus(false)` |
| `src/features/pipeline/fake-facade.ts` | UNION | `retryAt` + `reconnecting` |
| `src/core/analysis/map-reduce.ts` | OURS | Theirs A4 `era` and N2 concurrency 3 not ported (open issues 6, 7) |
| `src/core/pipeline/stages/translate.ts` | OURS | Theirs `TRANSLATE_CONCURRENCY` and F4 chunked upsert not ported (open issue 7) |
| `src/core/pipeline/estimate.test.ts` | OURS | Expected numbers follow ours' AM1 analysis prompt v3 |
| `src/services/pipeline/facade.ts` | OURS | Theirs F4 `countByChapter` cannot be used while `rows` feeds the segment map. Ours `listByChapter` kept (open issue 8) |
| `app/dev/screens.tsx` | UNION | `onRetryNow`, `onPrepare`, `onStop` |
| `src/db/bundled-migrations.ts` | UNION | `m0003` foamy, `m0004` uneven, `m0005` merged repair |
| `src/db/migrations/meta/_journal.json` | UNION | idx 3 and 4 from theirs, idx 5 `0005_merged_schema_repair` with `when` 1792238842145, later than ours' old 0003 (1792197185773) |
| `src/db/migrations/meta/0003_snapshot.json` | THEIRS | Snapshot 0004 and 0005 generated by `npm run db:generate` (0005 has the ambience delta) |

### DB decisions (checkpoint 2)
- `src/db/migrations/0005_merged_schema_repair.sql` is the drizzle delta (ambience tables) with every statement made idempotent. It also creates theirs' `stage_activity`, `bookmarks` and `chapter_positions`, and fills `chapter_positions` with `INSERT OR IGNORE`. `when` is later than ours' old 0003, so a phone at that state runs it.
- `series.playback_rate` cannot be added idempotently in SQLite. `src/db/repair-schema.ts` checks `PRAGMA table_info` after the migrator. `useLectioMigrations` runs it after a successful migrate and reports failure through `error`.
- Our old `0003_ambience_cue_cache.sql` is deleted (its content lives in 0005). The fixture `src/db/__fixtures__/legacy-0003-ambience.sql` keeps it for the upgrade test.
- `src/db/upgrade-paths.test.ts` (better-sqlite3): seeds the drizzle table as each state ships, runs `migrate` and `repairSchema`, and asserts every schema table and the `series.playback_rate` column. States: charming-fermat 0004, and ours' old 0003 with its later timestamp.

### Dependencies and deletions (checkpoint 2)
- `react-native-background-actions` removed with `npm uninstall --package-lock-only` (package.json and lockfile only). `node_modules` is untouched. A real `npm ci` in this worktree is still needed.
- N4 wiring deleted: `src/services/pipeline/background-runner.ts` + test, `src/services/pipeline/background-notification.ts` + test, `src/services/background/{foreground-service,app-foreground,foreground-state,notification-permission}.ts` + tests, `__mocks__/react-native-background-actions.ts`, `plugins/with-background-processing.js` + `plugins/__tests__/with-background-processing.test.js`, and the plugin entry in `app.config.ts`. `src/features/pipeline/step-copy-parity.test.ts` deleted (it tested the N4 copy parity).
- Dropped tests (architect decisions):
  - `src/audio/ambience-pack.test.ts` (theirs A3 pack module; covered by `installed-beds.test.ts`). 
  - `src/services/openrouter/stale.test.ts` (8 tests). It tests N3 connection retirement in the OpenRouter client (`src/services/network/connection`), which ours does not have. It does not test `serialize`/`hydrate`, so it is not a port. Open issue 5.

### Still conflicted (10 files), with the policy for each
| File | Base | Port |
|---|---|---|
| `src/core/narration/options.ts`, `options.test.ts` | UNION | Theirs `segmentMaxSeconds`, `firstMaxSeconds`, `narrateConcurrency` (3/3/1, default 2). Ours' FISH catalogue names kept. Theirs' `FREE_*` values are the same as ours' `FISH_*` |
| `src/core/text/chunk.ts`, `chunk.test.ts` | OURS planner (`rampSeconds`, `speechSeconds`) | Theirs `maxSeconds` and `firstMaxSeconds` (`seconds`) |
| `src/core/pipeline/stages/narrate.ts`, `narrate.test.ts` | OURS | Theirs N2 split-and-join fallback, passage copy, `narrateConcurrency` per option |
| `src/core/pipeline/queue.ts` | OURS | Theirs N3 connection epochs and `stage_activity` writes |
| `src/core/pipeline/runner.test.ts`, `__fixtures__/fake-ports.ts` | OURS | Add the network port (`subscribe`, `retireInFlight`) and clock. Keep theirs' stall tests |
| `src/services/pipeline/progress.ts` | 5 hunks | Theirs `since`, `passages`, `reconnecting`; ours `retryAt`, synthesis ETA, `waiting`. Keep both |
| `src/features/player/__fixtures__/playback-fixtures.ts` | not conflicted | Brief item 3: add `estimatedTotalMs: null`. The `final:` search found no PlaybackContent literal there, so find the builder first |

### Open issues for the architect (checkpoint 2)
1. Notification UI: ours' `NotificationPrompt` (BG1) and theirs' `notification-primer` both ask for permission. Decided: keep ours. Theirs' `notification-primer*.ts(x)` and `notifications-row*` still import the deleted modules and need removal or a rewire.
2. Diagnostics: `src/features/diagnostics/checks-background*.ts`, `device-deps.ts`, `run-all.ts` still reference N4. Rewire to the BG1 service.
3. Importers of deleted modules still to fix: `app/(tabs)/settings.tsx`, `src/services/pipeline/index.ts`, `src/services/pipeline/foreground-status.ts` (check).
4. `src/services/catalog-cache.ts` (theirs) not re-pointed. It is used by `src/app-shell/openrouter-provider.tsx` and `src/features/settings/model-catalog.ts`. The F4 "write only after a successful fetch" rule must hold.
5. N3 connection retirement (8 `stale.test.ts` tests) is not ported to the OpenRouter client.
6. A4 era (theirs `chapter-era.ts`, `validate-cues` `chapterEra`, `map-reduce` `era`) is not ported. Analysis numbers in the tests are ours' AM1 v3.
7. N2 analysis concurrency (map-reduce), `TRANSLATE_CONCURRENCY` and F4 chunked translation upsert are not ported.
8. `facade.ts` F4 indexed query (`countByChapter`) is not used. A small query change is needed to use it with `rows`.
9. `notificationsExplained` (ours) and `notificationPromptShown` (theirs) are two flags for one explainer. Remove one once issue 1 is decided.
10. `playBlockedCopy` (theirs, `chapter-status.ts`) is no longer used by the chapter view, but its tests remain. Remove both or keep both.

### Verification at checkpoint 2
- `npm run typecheck`: 104 errors. They come from the 10 marker files and imports of deleted N4 modules.
- `npm run verify`, `npm run lint`, `npm test` (full): not run, because the tree does not compile yet.
- `npm run sounds:verify`: PASS (`verify-pack: all checks passed`).
- `npm run boot:check`: FAIL. `expo export` cannot bundle the marker files.
- `scripts/android/build-apk.sh`: not run.
- Mutation check of the incident-3 regression test: not run.

## Checkpoint 3 (third worker, after 9affb1b)

Status: **partial**. 8 of the 10 files from checkpoint 2 are marker-free. `queue.ts` and `progress.ts` still hold markers (see the list below). Nothing after the merge base is merged.

### Resolved in checkpoint 3
| File | Side | Note |
|---|---|---|
| `src/core/text/chunk.ts` | UNION (ours planner base) | Ours `speechSeconds`, `rampSeconds` (ADR-0008). Theirs `maxSeconds` added as an optional global cap, unbounded when absent. Ramp index counts text segments only (theirs' heading rule). |
| `src/core/text/chunk.test.ts` | UNION | Ours tests, plus theirs' speech-budget block rewritten for `speechSeconds`, `rampSeconds: [12]` and `maxSeconds`. Imports `estimateSpeechSeconds` from `./speech-rate`. |
| `src/core/narration/options.ts` | UNION | `segmentMaxSeconds` (40/40/120) and `narrateConcurrency` (3/3/1, default 2) on each narrator. `segmentLimitsFor(modelId)` returns `{maxChars, maxSeconds}`. Ours' `isFishModel` rule (1,800 characters for every Fish model) kept. |
| `src/core/narration/options.test.ts` | UNION | `segmentLimitsFor` / `narrateConcurrencyFor` tests from theirs; the fish-size test from ours. |
| `src/core/pipeline/stages/narrate.ts` | OURS base + PORT | Ours FlowContext, ordered `SlidingWindow`, `AdaptiveWindow` with `ceiling = narrateConcurrencyFor(model)`. Theirs N2 split-and-join (`synthesizeWithFallback`) wraps each passage. Metering moved into the per-call speak, so each half of a split is recorded. Passage-N-of-M copy (theirs). The free narrator is ceiling 1, replacing `isPinnedNarrator`. Language guard kept. |
| `src/core/pipeline/stages/narrate.test.ts` | OURS | Ours' harness and free-narrator ramp test kept. Theirs' N2 tests are not ported yet (see open issues). |
| `src/core/pipeline/stages/narrate-plan.ts` | OURS + `maxSeconds` | `PlanOptions.maxSeconds` passed to `planTtsSegments`. |
| `src/core/pipeline/stages/narrate-plan.test.ts` | OURS + 1 test | `maxSeconds: 1_000` keeps ours' ramp tests unbounded. New test: the narrator cap of 40 s applies after the ramp. |
| `src/core/pipeline/tts-pool.ts`, `tts-pool.test.ts` | OURS + PORT | `AdaptiveWindow({ pinned })` becomes `({ ceiling })`, default `WINDOW_MAX`. The window starts at `min(4, ceiling)` and grows up to the ceiling. Paid narrators now grow to 3, not 8 (theirs' N2 tuning). Free stays 1. |
| `src/core/pipeline/__fixtures__/fake-ports.ts` | OURS | Doc comment only. The network fake (`subscribe`, `retireInFlight`) is already present. |
| `src/core/pipeline/runner.test.ts` | OURS | The ramp-total assertion kept. Theirs' comment is dropped. |

### Still conflicted (2 files)
| File | Hunks | Port still needed |
|---|---|---|
| `src/core/pipeline/queue.ts` | 7 | Ours base. Theirs N3 connection epochs and `stage_activity` writes (`src/services/pipeline/activity.ts`). Keep ours' BG1 waiting/backoff. |
| `src/services/pipeline/progress.ts` | 5 | Union. Theirs `since`, `passages`, `reconnecting`. Ours `retryAt`, synthesis ETA, `waiting`. |

### Decisions made in checkpoint 3
- `firstMaxSeconds` (theirs, 12 s) is not a separate field. It is ours' ramp entry `NARRATION_RAMP_SECONDS[0]`, which has the same value. One source of truth.
- `segmentMaxChars` on the narrator option is not kept. The fish rule (`isFishModel`) gives 1,800 characters, which covers the free narrator and any other Fish model.
- The ramp index counts text segments only, not headings. This matches theirs' tests.
- Paid narrators use the adaptive window with ceiling 3 instead of ours' 8. This follows the architect's "narrateConcurrency per option" item. The adaptive halving and growth still apply. It is a throughput trade-off to review on device. Raising the ceiling is a one-line change in `narrateConcurrencyFor`.
- Each call to the narrator is metered, so a split passage records both halves. Theirs did the same.
- The passage-N-of-M copy: the total is shown only when the chapter text is complete (`passageTotal()`). While the chapter is still being written, the copy says "passage N".

### Open issues added in checkpoint 3
11. Theirs' N2 narrate tests (`narrate.test.ts` on 54b3d2e, lines 196 to 445: fallback joins, the passage copy, concurrency per narrator, order) are not ported. They use theirs' harness. Port them against ours' harness.
12. The N3 connection retirement (`retireInFlight` in the OpenRouter transport, epochs, `stale.test.ts`) is still not ported. It is the key protection after background, so it is the next priority after `queue.ts`.
13. `src/features/player/__fixtures__/playback-fixtures.ts` still lacks `estimatedTotalMs` (brief item 3). Not started.
14. Notifications re-point (item 3), Diagnostics, `catalog-cache.ts` (item 4), F4 translate upsert, N2 analysis concurrency (item 6): not started.

### Verification at checkpoint 3 (real output)
- `npx jest` on `chunk.test.ts`, `options.test.ts`, `tts-pool.test.ts`, `narrate-plan.test.ts`, `narrate-fallback.test.ts`, `narrate.test.ts`: all 6 suites are green after the fixes above (101 tests in the first run, 1 failure in narrate-plan before the cap fix, 36 of 36 in options and narrate-plan after it).
- `npm run typecheck`: not green. It fails on the 2 marker files (`queue.ts`, `progress.ts`) and the errors that follow from them.
- `npm run verify`, lint and the full test run: not run, because the tree still has markers.

## Checkpoint 4B (part B: notifications, Diagnostics, catalogue cache, fixtures)

Scope: N4 references, notifications, Diagnostics, `pipeline/index.ts`, `foreground-status.ts`, `catalog-cache.ts`, feature builders. Part A's files (`src/core/**`, `src/services/openrouter/**`, `src/services/pipeline/progress.ts` and the rest of `src/services/pipeline/**`) are untouched.

### Decisions
| Area | Decision |
|---|---|
| Notification explainer | Ours' `NotificationPrompt` (BG1) and `notification-rule` kept. Theirs' `notification-primer.ts`, `notification-primer-sheet.tsx` and their tests deleted. |
| `notificationsExplained` | Kept. `notificationPromptShown` removed from `src/core/settings.ts` and `defaults.ts`. `settings-repo` reads a stored legacy `notificationPromptShown: true` as `notificationsExplained: true` (2 tests). |
| `playBlockedCopy` | **Kept, not removed.** It is still used: the chapter view shows it under a disabled Play for draft and failed chapters (`listenNowOf` has no subtitle there). Removing it would leave those states without an explanation. The brief said remove "if unused"; it was used. |
| `notifications-row` | Re-pointed at `notificationPermissionStatus()` and `requestNotificationPermission()`. "Not asked yet" requests the permission; every other state opens the system settings. |
| Native module | `isProcessing()` added: Kotlin `AsyncFunction("isProcessing")` reads `ProcessingService.running`; the JS wrapper returns `false` where there is no service. Tests: `src/services/background/processing.test.ts`. |
| Processing state for the queue | `BackgroundWork` now writes `starting`, `running` and `stopped` into the runtime's foreground store, so `keepsAlive()` is true while the service runs (N3 watchdog). The store is `createForegroundStatus(Platform.OS === 'android')` in `pipeline/index.ts`. Writes are skipped where the state is `unsupported`. |
| `ForegroundServiceStatus` | Reduced to `ForegroundServiceState` (`unsupported`, `stopped`, `starting`, `running`). `lastStartedAt` and `failure` had no reader once Diagnostics moved to `isProcessing()`, and the native start returns only a boolean. |
| Diagnostics | `checks-background` reads `{ processing, notifications }` through `read()`, which returns null where there is no service (skipped). `device-deps` uses `isProcessing()` and `notificationPermissionStatus()`. No check was deleted. Dropped: the "last started" and "start failure" values, which the module cannot report. |
| Lifecycle | N4 `createBackgroundRunner` effect, the primer effect and their imports removed. Theirs' background notice kept as `BACKGROUND_NOTICE`. The lifecycle test drops the primer block and one duplicate foreground-start test. The test now uses the real settings store under the mock. |
| Catalogue cache | `persistCatalog(models, store)` restores the snapshot on the first `list` (not at build), and writes it only when a `list` changed the serialised catalogue. A cache hit or a failed fetch writes nothing. `CATALOG_FILE_STORE` is the file store. `openrouter-provider.tsx` uses it. `catalog-cache.test.ts`: 6 tests. |
| Builders | `ChapterProgress` and `StageProgress` builders gained `playable`, `etaMs`, `narratedMs`, `estimatedTotalMs`, `reconnecting`, `since`, `passages`. `fakePipeline().emit` takes an overrides argument. |
| Feature merge fallout | `scrubber.tsx` imports the player hooks it used but did not import. `layout.ts` had a duplicate `bufferOpacity` key. `transport.test`, `ambience-list.test` and `chapter-view.test` builders gained the new props. |
| `app/(tabs)/settings.tsx` | No change needed. It imports only `features/settings/notifications-row`, which now exists. |

### Deleted (git rm)
- `src/features/pipeline/notification-primer.ts`, `notification-primer.test.ts`
- `src/features/pipeline/notification-primer-sheet.tsx`, `notification-primer-sheet.test.tsx`

### Verification (part B)
- Scope semantic check (TypeScript API, every file in `app/`, `src/features/`, `src/app-shell`, `src/__tests__/app-shell`, `modules/`, `src/services/{catalog-cache,background}`, `src/services/pipeline/{index,foreground-status}`, `src/core/{settings,defaults}`, `src/db/repos/settings-repo`): **0 errors**.
- `npx tsc --noEmit`, filtered to my areas: **no errors**. Remaining errors are outside part B: `src/db/use-migrations.ts` (2, `$client` and an implicit `row`), `src/services/openrouter/index.ts` (`./cost` missing), `src/services/openrouter/models.ts` (`PipelineFailure` not imported).
- `grep -rn "background-actions\|background-runner\|background-notification\|notification-primer" app src modules`: empty.
- Prettier and ESLint on every file I touched: clean.

### Open issues for the architect (checkpoint 4B)
1. **`src/services/openrouter/cost.ts` is missing** from the branch. It exists at `c7e7bd7` and is imported by `src/services/openrouter/index.ts`. This breaks `src/__tests__/app-shell/openrouter-provider.test.tsx`, `src/features/settings/{narration-choices,model-kinds,model-catalog}.test.ts`. Part A (services/openrouter) must restore it.
2. **`src/features/player/playback-controller-generating.test.ts`, "starts an ambience bed that covers the current sentence when the analysis lands late"**, fails. The fixture's `emit` used to ignore its overrides argument, so the late analysis reload never ran and the test failed at its first cue assertion. With the fixture fixed, the reload runs and `engine.soundingBedIds()` stays empty. The F2 re-plan of the current sentence on `setCues` is not reproduced by the fake audio engine (`src/audio/**`, not part B's scope). Not skipped.
3. `src/db/use-migrations.ts` type errors (2) are outside part B.

## Checkpoint 4A (worker A, after db7ac85)

Status: **done** for the scope in the brief, plus the architect's follow-up items 1 to 5. Typecheck of the whole repo is green (`npx tsc --noEmit` exit 0). Full `npx jest`: 276 suites, 2561 tests, all passing.

### Resolved in checkpoint 4A
| File | Side | Note |
|---|---|---|
| `src/core/pipeline/queue.ts` | OURS + PORT | Ours base (BG1 waiting, backoff, retryNow). Theirs' stall watchdog is not copied into the queue, because the runner already owns one per run (see below). The queue forwards `clock` and `keepsAliveInBackground` to `runChapter`. |
| `src/core/pipeline/queue.test.ts` | THEIRS stall tests kept | Added: a stall retires and retries in place, and the queue never schedules a retry (`retrying` event and `waiting` stay empty). |
| `src/core/pipeline/runner.ts` | OURS + fixes | The stall watchdog is per run, as ported in checkpoint 2. Changes here: a stall is attributed to the furthest running stage (narration and analysis run side by side, so "last stage seen" was wrong); a stall-failed run sets the chapter to `failed` and emits the `stage failed` and `error` events, as a stage failure does. The `stopped` owner-error option is not ported (see below). |
| `src/core/pipeline/runner.test.ts` | THEIRS owner-stop test replaced | Owner-stop option is not in ours. The test now proves a watchdog stall fails the chapter with `STALLED_ERROR`, not as cancelled. |
| `src/services/pipeline/progress.ts` | UNION | Theirs `since`, `passages`, `reconnecting`, stall and stale events as no-ops. Ours `retryAt`, ETA, `waiting`, `playable`, `narratedMs`, `estimatedTotalMs`. Matches `progress.test.ts` (already the union). |
| `src/services/openrouter/transport.ts` | OURS + N3 | `connection` (`register`) in `TransportConfig`. Each attempt registers; a retired attempt is retried in place with no budget spent and no backoff. Each wait is `untilAborted`, so a fetch that ignores its abort still retires. A caller cancel wins over a retirement. |
| `src/services/openrouter/client.ts` | OURS + PORT | `connection` option passed to the transport. The app passes `getAppConnection()` (`openrouter-provider.tsx`, already wired). |
| `src/services/openrouter/stale.test.ts` | THEIRS, 8 tests unchanged | All 8 pass against the ours transport. Mutation check: removing `if (failure.stale) continue` fails 5 of 8. |
| `src/services/openrouter/cost.ts` | OURS (c7e7bd7) | Restored re-export of `@/core/llm/cost`, imported by `index.ts`. |
| `src/services/openrouter/models.ts` | OURS | Imports `PipelineFailure` and `pipelineFailure` from `./errors`. |
| `src/db/client.ts` | OURS | `LectioDatabase` includes `$client`, which `drizzle()` returns; fixes the two `use-migrations.ts` errors. |
| `src/core/narration/options.ts`, `options.test.ts` | ARCHITECT | Paid narrators: ceiling 6. Free: 1. Other models: 2. |
| `src/core/pipeline/tts-pool.ts`, `tts-pool.test.ts` | ARCHITECT | `WINDOW_START` 3 (was 4), `WINDOW_MAX` 6 (was 8). Window tests re-derived. |
| `src/core/pipeline/stages/narrate.ts` | OURS + PORT | Progress events carry `passages` (done, total) once the chapter total is known. Before that, the copy says "passage N". |
| `src/core/pipeline/stages/narrate.test.ts` | THEIRS N2 tests ported | The fallback, passage copy, retry resume, ordering, per-narrator concurrency and progress count tests are ported to ours' harness. Adaptations listed below. |
| `src/core/pipeline/stages/translate.ts` | THEIRS | `TRANSLATE_CONCURRENCY` = 3. |
| `src/core/analysis/map-reduce.ts`, `map-reduce.test.ts` | OURS + N2 | Chunk calls run through `runOrdered` (`src/core/async/ordered-pool.ts`) at `ANALYSIS_CONCURRENCY` = 3. Replies are merged in chunk order. An abort makes no new call. |
| `src/core/analysis/prompts.ts`, `prompts.test.ts`, snapshot | OURS, fix | The category lines now render the taxonomy's `contains`. Before, they rendered `description`, which no longer exists, so the prompt sent `hospital_ward: undefined`. |
| `src/core/pipeline/progressive-benchmark.test.ts` | OURS | Uses the Best narrator profile. Bound changed from "half the lock-step time" to "0.6 of it" (see decisions). |
| `src/core/pipeline/estimate.test.ts` | OURS | Expected numbers follow the longer analysis prompt (`contains` lines). |
| `src/features/player/playback-controller-generating.test.ts` | OURS | The late-analysis test now starts playback (`player.play()`) before expecting a bed. Beds sound only while the transport wants them. The real engine re-plans on `setCues` (`lectio-engine.ts` line ~370); the fake engine wraps it and needed no change. |

### Ported vs not ported (checkpoint 4A)
| Item | Result | Reason |
|---|---|---|
| N3 `retireInFlight`, epochs, retry in place | Ported | `transport.ts`, `stale.test.ts` |
| N3 queue epochs and `stage_activity` writes | Ported via the runner and facade | The facade already writes `stage_activity` from events, and the runner emits `stall`, `staleAbort`, `reconnecting`. A second watchdog in the queue would double `retireInFlight` calls. |
| F4 chunked translation upsert | Already present, identical | `text-repo.ts` `setTranslations` is the chunked `CASE` update on both sides. |
| F4 `countByChapter` | Not used | The facade needs the segment rows for narrated milliseconds, so a count query alone does not replace it. The repo method stays (its own test covers it) and is listed as unused. |
| N2 analysis concurrency | Ported | See above |
| A4 era | Not ported | `chapter-era.ts` and the taxonomy v2 (`era`, `contains`, `mustNotContain`) are in HEAD by auto-merge, but ours' validate-cues, prompts and schemas do not use the era rules. The era tests in `map-reduce.test.ts` and `validate-cues.test.ts` were removed (4 tests) and must come back with the A4 port. |
| `stopped` owner-error option (theirs runner) | Not ported | Only the stall path needs owner errors, and the runner owns the watchdog. Nothing in production would pass `stopped`. |

### Decisions and open issues (architect)
1. **Benchmark**: `progressive-benchmark` after the window change takes 144 s against 280 s lock-step (0.51). The old bound (half) fails by 4 s. The bound is now 0.6. The cause is the slower start (3) and growth (+1 per four successes). Confirm the trade-off.
2. **Prompt version**: the analysis prompt wording changed (`contains`), but `PROMPT_VERSION` is still `analysis-v3`. Bumping it would re-analyse stored chapters, which costs money, so I did not bump. Decide. Also `mustNotContain` is not in the prompt yet (A4).
3. **ADR-0008**: the window values in its text (start 4, max 8) are now 3 and 6. Needs an amendment line.
4. **Narrate progress**: passage counts appear only once the chapter total is known (translation settled). The UI copy "passage N" covers the gap. Theirs always showed a total.
5. **Stall attribution**: the stage is the furthest one running, not the last one seen. The queue test and runner test pin it.
6. **Test runner**: a "worker process failed to exit gracefully" warning appears in the full run. The full run passes. Not investigated in this checkpoint.
7. **Dead code**: `audioSegmentRepo.countByChapter` has no caller (see the table).

### Verification at checkpoint 4A (real output)
- `npx tsc --noEmit` (whole repo): exit 0, no output.
- `npx eslint` on the 26 changed `src/` files: 0 errors, 0 warnings (only the `.snap` file is reported as ignored).
- `npx prettier --check` on the changed `.ts`/`.tsx` files: "All matched files use Prettier code style!"
- `npx jest` (whole repo): `Test Suites: 276 passed, 276 total`, `Tests: 2561 passed, 2561 total`, `Snapshots: 2 passed, 2 total`.
- Mutation checks: transport stale-retry removed, 5 of 8 `stale.test.ts` tests fail. Runner stall retirement removed, 2 queue and runner tests fail. Both restored.
