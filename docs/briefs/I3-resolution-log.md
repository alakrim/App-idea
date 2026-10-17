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
