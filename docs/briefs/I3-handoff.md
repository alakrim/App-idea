# I3 handoff: finish the merge of `54b3d2e` (fresh worker)

**Checkpoint:** the merge is committed as a WIP with 31 files still holding conflict markers. Continue from this commit on the same branch. Do not merge anything after `54b3d2e`. The policy table is in `docs/briefs/I3-unify-lines.md`, and the done work is in `docs/briefs/I3-resolution-log.md`.

Use `git show 54b3d2e:<path>` for theirs and `git show ee5b958:<path>` for the merge base. `git diff ee5b958 HEAD -- <path>` shows ours. Do not use bare `git stash`.

## 1. Conflicted files left (31), with what to do
Each one: take the policy base, then port the other side's listed items, then `git add`.

**Pipeline core (base OURS, port THEIRS)**
- `src/core/pipeline/queue.ts`: base OURS (F1 queue, BG1 waiting/backoff). Port THEIRS N3 connection epochs and `stage_activity` writes (their queue diff is +100 lines, mostly in `queue.ts`). Check `src/services/pipeline/activity.ts`, which is theirs.
- `src/core/pipeline/stages/narrate.ts`: base OURS (F1 pool, tts-pool, narrate-plan). Port THEIRS N2: split-and-join fallback (`narrate-fallback.ts` is already staged), the "The narrator service didn't answer for passage N of M. Your progress is saved. Tap Retry to continue." copy, and the `narrateConcurrency` per option. Keep OURS' ordered pool and the language guard.
- `src/core/pipeline/stages/translate.ts`: base OURS. Port THEIRS `TRANSLATE_CONCURRENCY = 3` and F4 chunked persistence, and check the stage-level `stopped`.
- `src/core/pipeline/stages/narrate.test.ts`, `src/core/pipeline/runner.test.ts`, `src/core/pipeline/estimate.test.ts`, `src/core/pipeline/__fixtures__/fake-ports.ts`: base OURS. Add the network port (`subscribe`, `retireInFlight`) and clock to the fakes so the runner's new watchdog has a port. Keep theirs' runner stall tests (from `runner.test.ts` on theirs) and mutation-check them.

**Narration and text (base OURS for settings; port THEIRS)**
- `src/core/narration/options.ts`, `options.test.ts`: union. Theirs `segmentMaxSeconds` (40/40/120), `firstMaxSeconds` 12, `narrateConcurrency` (3/3/1), and ours' N2 catalogue fields.
- `src/core/text/chunk.ts`, `chunk.test.ts`: theirs seconds-based planning (`TtsPlanInput.seconds`, `maxSeconds`, `firstMaxSeconds`). Keep ours' fields.
- `src/core/defaults.ts`, `src/core/settings.ts`: union. Every setting from both sides with zod defaults. Theirs added `playbackRate`/bookmark-related settings and notifications.
- `src/core/analysis/map-reduce.ts`: base OURS (AM1). Port THEIRS N2 analysis concurrency 3 with chunk order kept, and cancellation stopping new calls.

**Database (union)**
- `src/db/bundled-migrations.ts`, `src/db/migrations/meta/_journal.json`, `src/db/migrations/meta/0003_snapshot.json`: keep theirs `0003_foamy_nuke` and `0004_uneven_zuras` (+ their snapshot), then ours as `0005`. Ours' `0003_ambience_cue_cache` and the `ambience_reports` table must be re-generated as `0005` with `npm run db:generate` after `schema.ts` is merged. Then add the idempotent repair migration (`CREATE TABLE IF NOT EXISTS` for every table of theirs' 0003/0004 and ours' tables). Keep `bundled-migrations.ts` and the journal test consistent.
  - Add a better-sqlite3 test that runs the migrator from (a) a DB at theirs' 0004 and (b) a DB at ours' old 0003 (applied under a later timestamp). Assert that every table exists.

**Chapter feature (union: theirs F2 a11y and copy, ours F2 Listen now and ETA)**
- `src/features/chapter/chapter-status.ts`, `chapter-status.test.ts`, `chapter-view.tsx`, `chapter-view.test.tsx`, `chapter-screen.tsx`, `chapter-deep-link.test.tsx`, `ambience-list.tsx`: union. Theirs: stop a running chapter, priced re-generate, try again, the Create gate copy, menus, 48 dp. Ours: Listen now, waiting card, live ETA, ambience list.

**Pipeline feature and services (union)**
- `src/features/pipeline/pipeline-lifecycle.tsx`, `pipeline-lifecycle.test.tsx`, `fake-facade.ts`: theirs N4 `background-runner` (react-native-background-actions) MUST be removed. Only ours' BG1 foreground service (`modules/lectio-background`) remains. Keep theirs' N3 watchdog wiring and `notification-primer`. Keep N4's notification copy if better, with "Narrating · passage N of M" added if cheap.
- `src/services/pipeline/facade.ts`, `progress.ts`: union. Theirs `activity` / `foreground-status` / `stage_activity` surfaces and F4's indexed queries. Ours `estimatedTotalMs` and `waiting` state.

**App and dev (whatever compiles)**
- `app/dev/screens.tsx`: the fixture set needs both feature sets. No port needed beyond compile.

## 2. Things outside the conflict list that still need action
1. **Remove the N4 background wiring.** Delete `src/services/pipeline/background-runner.ts` and `background-runner.test.ts`, `src/services/pipeline/background-notification.ts` and its test, and `__mocks__/react-native-background-actions.ts`, if they are not used by ours. Check `src/features/pipeline/notification-prompt*` against BG1.
2. **Remove the dependency:** `npm uninstall react-native-background-actions`. This is the one allowed npm command. The worktree's `node_modules` is a symlink to `/home/user/App-idea/node_modules`, which the main checkout shares, so run the uninstall in a real install: first `rm node_modules` (the symlink only), then `npm ci` after the uninstall, or confirm with the architect before touching the shared directory. `package.json` already has ours' scripts plus `sounds:verify` in `verify`.
3. **`src/features/player/__fixtures__/playback-fixtures.ts`**: add the `estimatedTotalMs` field of `PlaybackContent` (null by default).
4. **`src/audio/ambience-pack.test.ts`** (theirs, staged): tests theirs' A3 pack module. Drop it or port it to ours' `ambience-pack.ts`. Record the decision in the resolution log.
5. **Check theirs' `stale.test.ts`** (`src/services/openrouter/stale.test.ts`, staged): it tests theirs' `loadSnapshot`/`onFetched` API. Port to ours (`serialize`/`hydrate` plus the dedupe) or drop with a listed reason.
6. **`src/services/catalog-cache.ts`** (theirs, staged): uses theirs' catalogue API. Re-point it at ours' `serialize`/`hydrate`, and make the write happen only after a fetch.
7. **`src/services/pipeline/adapters/catalog.ts`**: ours; check the snapshot write rule (after fetch only).
8. **`assets/ambience/LICENSES.json`**: check that every SND1 bed has a ledger row.
9. **Settings**: theirs' `app/settings/api-key.tsx`, `playback.tsx`, notifications row, and `src/features/settings/**` are staged or auto-merged. Verify they compile against ours' speech catalogue.

## 3. Verification still owed (none was run at this checkpoint)
- `npm run typecheck`, `npm run lint`, `npm test` (or `npm run verify`). Expect failures until the 31 files are resolved.
- The incident-3 regression test `src/audio/native-engine.test.ts` must pass, and must fail when the focus request is restored (mutation check).
- `npm run sounds:verify`, `npm run boot:check`.
- `scripts/android/build-apk.sh`: manifest permissions and services. Expected: exactly one processing foreground service (ours) plus expo-audio's media service.
- Test count: report the union of both sides' tests, minus duplicates listed by name.

## 4. Known risks
- The worktree `node_modules` is a symlink to the shared checkout. Do not run `npm install` or `npm uninstall` through it.
- The branch currently contains conflict markers in the 31 files above. Do not push it.
