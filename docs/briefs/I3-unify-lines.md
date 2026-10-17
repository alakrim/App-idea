# Brief I3: Unify the two code lines (blocking for the debug sweep)

**Type**: integration (merge + conflict resolution + verification). **Do this first; everything else waits on it.**

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md` (React Compiler and Worklets rules), `docs/STATE.md` on **both** sides (the "Branch divergence" and "Incident 4" sections on ours; the "Paused (2026-10-14)" section on theirs), ADR-0007, ADR-0008, ADR-0005 with all its amendments, and theirs' `docs/briefs/{N2,N3,N4,L1,F1-player-audio-fixes,F2-ui-a11y-fixes,F4-performance-fixes}.md`.

## Why
- Since 2026-10-11 the code has been split across two lines:
  - **ours**: `claude/serene-hypatia-73g7qo`, with today's BG1, N2 catalogue, AM1, SND1, F1/F2 progressive narration, and the incident-4 fix
  - **theirs**: `claude/charming-fermat-srbk25` at **`54b3d2e`**, its last verified commit
- The user's device test of ours showed that the **incident-3 bug came back**: "narration stops and starts like a broken CD". Its fix (`254fbad`, audio focus) exists only on theirs. Every later fix is lost the same way while the lines stay split.
- Merge `54b3d2e` into ours. **Do not** merge theirs' later WIP commits (F3/A4 WIP after `54b3d2e`); they are unverified.

## Conflict policy (architect decisions; apply them, don't re-litigate)
Run `git merge 54b3d2e`. About 70 files conflict. Resolve them per area:

| Area | Base | Port from the other side |
|---|---|---|
| `src/audio/**` (engine, native engine, mixer) | **theirs** (it has the incident-3 focus fix and its regression test, plus F1 player/audio fixes) | ours: F2's `setCues` and the buffering / narrating-ahead hooks |
| `src/features/player/**` | **theirs** (F1, L1 per-chapter resume, bookmarks, speed per series, F2 a11y) | ours: F2 buffer band, clamp, "Narrating ahead…", late cues, the playable announcer, and `waiting` counted as narrating |
| `src/core/pipeline/**` (runner, queue, stages, tts-pool, progress), `src/services/pipeline/**` | **ours** (F1 concurrent runner, adaptive TTS pool, speech-seconds ramp, BG1 queue waiting/backoff) | theirs: N2's split-and-join fallback and stage timings for Diagnostics, N3's stall watchdog and connection epochs (`stage_activity`), F4's chunked translation upsert and indexed queries, and any F2 "stop a chapter" / priced re-generate behaviour |
| Background service | **ours** (`modules/lectio-background`, BG1) | **Remove** theirs' N4 `react-native-background-actions` wiring, so only one foreground service exists. Remove the dependency from `package.json` and the lockfile with `npm uninstall react-native-background-actions`; this is the one allowed npm command. Keep N4's notification copy if it is better ("Narrating · passage 5 of 18" needs a segment total, so add it if cheap). Keep N3's watchdog running while the service runs. |
| `src/services/openrouter/**` | **ours** (per-call timeouts, sampling-hint guard, N2 catalogue with `createdAt`) | theirs: F4's catalogue snapshot only after a fetch plus in-flight dedupe, and N2's longer timeouts if theirs are longer |
| `src/core/analysis/**` | **ours** (AM1 prompt v3, cache, fallback, report) | theirs: anything else they changed there |
| `src/features/settings/**`, `app/settings/**` | **ours** for the speech catalogue (N2) | theirs: F2 a11y/contrast/onboarding order |
| `src/ui/**`, tokens | **theirs** (F2 contrast tokens, 48 dp targets) | none |
| Ambience assets and scripts (`assets/ambience/**`, `scripts/sounds/**`, `src/audio/ambience-pack.ts`, `installed-beds.ts`) | **ours** (SND1: 40 beds in `beds/`) | **Drop** theirs' A3 Freesound beds: their STATE says "A3 must not ship as is". Keep their `LICENSES.json` rows only for files that remain. |
| DB | union of both sides | Keep theirs' `0003_foamy_nuke` and `0004_uneven_zuras`, then ours as **`0005`**: re-generate ours with `npm run db:generate` after merging `schema.ts`. Keep `bundled-migrations.ts` and the journal test consistent. Check that a DB at theirs' 0004 upgrades and a DB at ours' old 0003 still works (see below). |
| `src/core/settings.ts`, `defaults.ts` | union | Every setting from both sides, with zod defaults. |
| `docs/STATE.md` | **ours** | Append theirs' unique sections under a heading "Merged from charming-fermat (54b3d2e)". The architect rewrites it afterwards. |
| `app/dev/screens.tsx`, fixtures, fakes | whatever compiles with both feature sets | none |

**Migration edge case**: a phone that ran ours' `bfbcc4f`/`6842a51` has ours' old 0003 (`ambience_cue_cache`, `ambience_reports`) applied under a timestamp later than theirs' 0003/0004, so drizzle will **skip** theirs' tables there.
- Make the new 0005 and the app robust to this: use `CREATE TABLE IF NOT EXISTS` for every table in theirs' 0003/0004 and ours' tables, idempotently, in a final migration that checks and repairs.
- Add a test that runs the migrator from both starting states (better-sqlite3) and asserts every table exists.

## Verification (paste evidence)
- `npm run verify` is green. Report the test count; it should be about the union of both sides, with no tests deleted except duplicates you list.
- The incident-3 regression test (`src/audio/native-engine.test.ts`, no focus requests to react-native-audio-api) is present and passing. Mutation-check it.
- `npm run sounds:verify` and `npm run boot:check` are green.
- `scripts/android/build-apk.sh` builds. Report the manifest permissions and services: exactly one processing foreground service plus expo-audio's media service.
- Write a list of every conflict file and the side or merge you chose, at `docs/briefs/I3-resolution-log.md`.

## Constraints
- Work in your worktree. If `node_modules` is missing, run `ln -s /home/user/App-idea/node_modules node_modules`; after the `npm uninstall`, use a real `npm ci` in your worktree instead of the symlink.
- Commit on your branch with your harness Co-Authored-By trailer plus `Claude-Session: https://claude.ai/code/session_016sqBEw3paK5QXmP6QkprQ9`. Do not push.
- Context budget: at about 220k tokens (about 150 tool calls), stop at a committed checkpoint (`git commit` with resolved files only is impossible mid-merge, so use `git stash`-free WIP: commit the merge with remaining conflicts listed in `docs/briefs/I3-handoff.md` and the markers kept), and report.
