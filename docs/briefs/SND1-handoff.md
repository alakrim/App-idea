# SND1 handoff (WIP checkpoint, not verified)

Worktree: `/home/user/App-idea/.claude/worktrees/agent-a79e53962e02c2cb4`, branch `worktree-agent-a79e53962e02c2cb4`.
Merged `claude/serene-hypatia-73g7qo` (48b56e0) into the branch at b89e49f. Do not push.

**Verified: nothing.** `npm run sounds:verify`, `npm run verify` and the test suites have not been run on the final state.

## Count
- Category-id beds installed (the number that counts toward the 30 target): **20** (the 16 procedural beds, plus clock_ticking, train_interior, qi_hum, spirit_whispers).
- Base-pack ids (base_rain, base_wind, base_ocean, base_crowd, base_space_hum, base_fire) are fallback targets, not category ids, so they do not count.
- **About 10 more category ids are still needed.** The 15 sampled targets in `scripts/sounds/curation-targets.mjs` are the first source. Any that have no usable CC0 or CC BY source need a new procedural recipe. Candidates for procedural fallback: open_field_wind, fireplace_crackle, horse_trot, ship_deck, battle_field, city_street_day, jungle_insects, city_night.

## What is on disk
- `scripts/sounds/bed-recipes.mjs`: `bed-recipes-v3`. Pulse periods (heartbeat, clock, train) are derived from the loop length (LOOP_T/60, /30, /100), so they wrap without a seam. The clock tick level is 0.1 (0.15 measured -2.6 dBTP). Procedural recipe ids: the 26 keys of `PROCEDURAL_RECIPES`, including the 6 base ids.
- `assets/ambience/beds/`: the procedural .m4a files. A full rebuild (`npm run sounds:build`) was in progress at checkpoint time, so re-run it and check that the manifest matches the files. The manifest is written only at the end of a build.
- `scripts/sounds/verify-pack.mjs`: rewritten. Checks expected ids (recipes plus picks), taxonomy ids, the requires in `src/audio/ambience-pack.ts`, sampled-licence re-checks, loop 45 to 63 s on a frame boundary, loudness, true peak, seams and the 20 MiB budget. Last run passed 25 of 26 beds. The only failure, `tense_heartbeat`, was caused by the loop-length issue fixed in v3. Not re-run since.
- Curation: `scripts/sounds/curation-targets.mjs`, `curation-sources.mjs` (archive.org with licence-filtered queries, `inspectArchiveItem` for durations, Commons), `curation-score.mjs` (screen, then score), `curate-open.mjs` (writes `assets/ambience/curation/<category>.json`). A full run was in progress at checkpoint time. The archive.org licence filters that work: `licenseurl:*publicdomain*` and quoted `licenseurl:"https://…/by/4.0/"` or `"http://…/by/3.0/"`. The wildcard form fails on slashes for CC BY.
- `assets/ambience/curation/picks.json`: `[]`. Not yet written.
- `scripts/sounds/build-open-pack.mjs`: written, not run. It needs `picks.json`, and it uses `package.json` scripts that do not exist yet.
- `assets/ambience/LICENSES.json`: procedural and in-house rows only.
- `src/features/settings/licenses.ts` and `app/settings/about.tsx`: CC BY credit line added. `src/features/settings/licenses.test.ts` still expects the old shape (`credit` is missing) and must be updated.

## Next steps, in order
1. Confirm the `build2` and `curate2` logs end in `BUILD_EXIT=0` and `CURATE_EXIT=0`. Then run `node scripts/sounds/verify-pack.mjs` (the procedural pack should pass).
2. Review `assets/ambience/curation/*.json`. Pick one candidate per category for the sampled beds, and write `picks.json` (pickSchema: category, source, title, author, pageUrl, downloadUrl, licenseName, licenseUrl, reason). Remove the procedural recipe for any category that becomes sampled. `build-open-pack.mjs` throws if a category is in both.
3. Add npm scripts: `sounds:curate`, `sounds:build-open`, `sounds:test` (`node --test scripts/sounds/*.test.mjs`).
4. Run `npm run sounds:build-open`, then `npm run sounds:verify`.
5. Procedural recipes for the categories that have no source. Reach at least 30 category-id beds.
6. `src/audio/ambience-pack.ts`: switch requires to `assets/ambience/beds/`, add `INSTALLED_BED_IDS` with `Record<InstalledBedId, number>`, and remove the `isBasePackId` dependency. Add tests in `src/audio/ambience-pack.test.ts`: at least 30 categories resolve to themselves, and the rest resolve through fallbacks or skip.
7. Update `licenses.test.ts` for the `credit` field. Add tests for `licence.mjs`, `steady-window.mjs` and the scorer, using `node:test` (no new dependencies).
8. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run verify`.
9. Audition page at `/tmp/claude-0/-home-user-App-idea/ef5ed08e-b854-5c2f-a06d-b531f619614d/scratchpad/audition/index.html`, with the .m4a files copied beside it.
10. `docs/STATE.md`: add one "SND1" line under "Work in flight". Update `assets/ambience/README.md` (`base/` is now `beds/`, and ledger `source` is the page URL).
11. Commit with the trailer the harness gives (Haiku 5.5) and the Claude-Session line. Report the branch and SHA.

## Decisions
- Ledger `source` for sampled rows is the page URL (the licence is visible there). The README says download URL, so update it.
- All beds use a 60 s loop (LOOP_SAMPLES) so the frame-aligned check stays simple. This is inside the 45 to 63 s range.
- Trailer: the coordinator asked for the harness trailer (Haiku 5.5). Use that, not Opus 5.5.
