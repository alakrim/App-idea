# SND1 handoff (paused, unverified)

Worktree: `/home/user/App-idea/.claude/worktrees/agent-a79e53962e02c2cb4`. Paused by the coordinator to limit parallel agents. Nothing here passes `npm run sounds:verify` or `npm run verify`. No app wiring has been done.

## State of the pack
- `assets/ambience/base/` is moved to `assets/ambience/beds/` with `git mv`. The six base files are still there.
- `npm run sounds:build` was run several times. The last run failed at `clock_ticking` (true peak -2.6 dBTP, limit -3). It rewrites each bed file as it goes but writes `manifest.json` only at the end, so the **manifest is stale**: the six base `.m4a` files and the first procedural beds on disk no longer match their sha256 and bytes in `beds/manifest.json`. Rerun the build before anything else.
- `scripts/sounds/` is rewritten: `pack-spec.mjs`, `licence.mjs`, `http.mjs`, `bed-recipes.mjs` (20 new procedural recipes plus the six old ones), `bed-encoder.mjs` (the one loop recipe), `steady-window.mjs`, `pack-manifest.mjs`, `build-base-pack.mjs`, and `ffmpeg-tools.mjs` (`decodeMono` takes an optional filter).
- `verify-pack.mjs` has not been updated. It still expects the old base list and a fixed 60 s loop, and it does not yet check licences.

## Beds done (procedural, rendered in the last build run)
| id | status |
|---|---|
| base_rain, base_wind, base_ocean, base_crowd, base_space_hum, base_fire | rebuilt; bytes differ from the committed manifest (the recipe now includes a 25 Hz high-pass on tonal stems and `bed-recipes-v2`) |
| forest_night, light_rain, heavy_rain, rain_on_window, river_stream, storm_wind, blizzard_wind, mountain_wind, snowfall_quiet, office_hum, library_quiet, airplane_cabin, spaceship_engine, starship_bridge, ominous_drone, tense_heartbeat | encoded, -28 LUFS, about 494 to 514 KB each; not verified by ear |
| clock_ticking | **fails**: true peak -2.6 dBTP (the clicks are too loud relative to the room tone) |
| train_interior, qi_hum, spirit_whispers | recipes written, **not yet built** |

Recipe lessons: `tremolo` has a 0.1 Hz minimum. Every noise recipe must end in `[out]`. Clicks need about 0.15 of full scale to keep the peak under -3 dBTP after gain.

## Sampled candidates (probed, not yet curated)
- Commons search works through the generator API. It returns licence (`LicenseShortName` and `LicenseUrl`). Results are mostly short bird clips: "Birds Perungalathur Reserved Forest.wav" (CC BY 4.0). Many are CC BY-SA, so they are rejected.
- archive.org advancedsearch works with `fl[]=length` and `licenseurl`. Example: "Ghosts of Oregon" (Scare You To Sleep) has no `licenseurl` in its metadata, so it is rejected. Long items exist.
- OpenGameArt content pages expose the licence (`license-name`) and direct file links. Example: `/content/rain-and-thunders`, CC0, file `/sites/default/files/Dark_Rainy_Night%28ambience%29.ogg`. Author is in `/users/<name>`.
- freesound.org returns 403. Node `fetch` works through the proxy (no env flag needed).
- No candidate has been downloaded, and no duration has been measured.

## What remains (in order)
1. Fix `clock_ticking` (lower the click level further, or add a short room-tone bump), then build `train_interior`, `qi_hum` and `spirit_whispers`. Rerun `npm run sounds:build` until the manifest matches the files.
2. Write `scripts/sounds/curation-targets.mjs`, `curate-sources.mjs` (Commons, archive.org, OGA), `curate-open.mjs` and `curation-score.mjs`. Each writes `assets/ambience/curation/<category>.json` with licence evidence. Use `classifyLicence` from `licence.mjs`.
3. Target sampled categories (15): forest_day_birds, jungle_insects, ocean_waves, open_field_wind, city_street_day, city_night, market_crowd, crowd_murmur, tavern_crowd, castle_hall, fireplace_crackle, cafe_soft, horse_trot, ship_deck, battle_field. Fall back to a procedural recipe for any with no usable CC0 or CC BY source.
4. Review the candidates, then write `assets/ambience/curation/picks.json`. Write `build-open-pack.mjs`: download to a fresh work dir, decode with a 25 Hz high-pass, trim 1 s at each end, pick the window with `steadiestWindowStart`, then call `encodeBed`. Write the manifest and ledger rows (`source: 'sampled'`, with licence, licenseUrl, author, title, sourceUrl, originalSha256 and downloadDate).
5. Update `verify-pack.mjs`: expected ids from the recipes plus picks, the loop region between 45 and 63 s on a frame boundary, a licence check on every sampled row, and a 20 MB budget.
6. App wiring: widen `src/audio/ambience-pack.ts` to an installed-bed id union with a `Record` (the taxonomy file stays read-only). Add the tests: at least 30 categories resolve to themselves, and the rest resolve through their fallbacks. Add CC BY credits to `src/features/settings/licenses.ts` and `app/settings/about.tsx`.
7. Tests for `licence.mjs`, `steady-window.mjs` and the curation score. Add a `sounds:test` script.
8. Audition page in the scratchpad (`audition/index.html`), an entry in `docs/STATE.md` under "Work in flight", and a README update.
9. Report the table (category, source, licence, author, duration, LUFS, seam metrics, size). Pasted tails of `npm run sounds:verify` and `npm run verify`.

## Files left on disk outside the repo
- `/tmp/claude-0/-home-user-App-idea/ef5ed08e-b854-5c2f-a06d-b531f619614d/scratchpad/work/` holds only temporary synthesis files from the build. There are no downloaded sources yet.
- `/tmp/claude-0/-home-user-App-idea/ef5ed08e-b854-5c2f-a06d-b531f619614d/scratchpad/probe/` holds API probe responses.
