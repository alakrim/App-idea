# Brief SND1: At least 30 distinct ambience beds, installed and mapped

**Type**: implementation (sound sourcing and synthesis tooling + assets + app wiring).

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md`, **ADR-0005 and its amendments** (including 2026-10-17, which widens the licences allowed), `docs/research/R4-ambience.md`, `docs/briefs/A3-freesound-ambience.md` (the same processing recipe; Freesound itself is still blocked), `scripts/sounds/*`, `assets/ambience/{README.md,LICENSES.json,base/manifest.json}`, `src/audio/ambience-pack.ts`, `src/core/playback/resolve-bed.ts`, `src/core/analysis/ambience-taxonomy.ts` and `src/features/settings/licenses.ts`.

## Why
Today only **6** procedural beds are installed (rain, wind, ocean, crowd, space hum, fire). The taxonomy's 50 bed categories all fall back to those 6, and three of them (`spirit_whispers`, `tense_heartbeat`, `clock_ticking`) fall back to nothing. The user wants **at least 30 distinct background sounds** ready to use, covering a wide range of scenes. Quality can be "good enough for now": pick the best available.

## Network facts (checked 2026-10-17)
- `freesound.org` returns 403 (blocked).
- Reachable: `opengameart.org`, `commons.wikimedia.org` / `upload.wikimedia.org`, `archive.org`, `zenodo.org`, `huggingface.co`, `www.soundjay.com`.
- `pixabay.com` and `sonniss.com` return 403.
- The BBC sound archive is reachable but **non-commercial: do not use it**.

## Licences (ADR-0005 amendment)
- **Allowed**:
  - CC0 or Public Domain (preferred).
  - CC-BY 3.0 or 4.0, with attribution recorded in `LICENSES.json` **and** shown in Settings → Licenses.
- **Not allowed**:
  - NC, ND or SA.
  - Any "royalty-free but no redistribution" licence (soundjay's terms forbid redistribution in apps; skip it unless its page says otherwise).
  - Anything whose licence you cannot see on the file's own page.
- Record per file: source URL, author, licence, licence URL, download date, sha256 of the original.

## Scope
1. **Target list**: at least 30 **taxonomy bed ids** with their own installed sound, so `resolveBed` returns the exact id. Use existing category ids only; do not add or rename categories. Cover all families: nature, weather, urban, interiors, travel, battle, mystic, sci-fi and mood. Must-haves:
   - nature and weather: `forest_day_birds`, `forest_night`, `open_field_wind`, `mountain_wind`, `ocean_waves`, `river_stream`, `jungle_insects`, `light_rain`, `heavy_rain`, `storm_wind`, `snowfall_quiet`, `blizzard_wind`, `rain_on_window`
   - urban: `city_street_day`, `city_night`, `market_crowd`, `crowd_murmur`
   - interiors: `tavern_crowd`, `castle_hall`, `fireplace_crackle`, `library_quiet`, `office_hum`, `cafe_soft`
   - travel and battle: `horse_trot`, `ship_deck`, `train_interior`, `airplane_cabin`, `battle_field`
   - sci-fi and mood: `starship_bridge`, `spaceship_engine`, `ominous_drone`, `tense_heartbeat`, `clock_ticking`, `qi_hum`, `spirit_whispers`
   - Fill more when you can.
2. **Two sources, best per category**:
   - **Sampled**: search the reachable sources' APIs:
     - Wikimedia Commons API: `action=query&list=search` with `filetype:audio`, plus `imageinfo` + `extmetadata` for the licence
     - OpenGameArt: CC0 audio, with the licence on the page
     - archive.org advancedsearch, with `licenseurl` or PD
   - Write `scripts/sounds/curate-open.mjs`, which writes `assets/ambience/curation/<category>.json` (top candidates, licence evidence and the reasons) for review in git. Prefer field recordings over 30 s, without music or intelligible speech.
   - **Procedural**: extend `build-base-pack.mjs` recipes (versioned) for textures that synthesize well. Good candidates: wind and rain variants, river or stream (filtered noise with modulation), hums and drones, the heartbeat (a low thump pair at about 60 bpm), clock ticking, crickets for the night forest (modulated sine bursts), cabin and engine rumble, and the qi or spirit pads (slow-beating detuned sines plus filtered noise, no melody).
   - Choose per category whichever is better, and say why in the table.
3. **Processing**: use exactly the base pack's recipe for every bed, sampled or procedural:
   - a seamless loop with the roll and crossfade
   - two-pass loudnorm to −28 LUFS, and a true peak check
   - AAC-LC mono 64 kbps
   - 45–63 s loop length, with a frame-aligned loop region
   - a high-pass at 25 Hz; trim noisy edges, and pick the steadiest window
   Refactor the shared code instead of copying it. Write the files to `assets/ambience/beds/<category>.m4a`, or extend `base/`, whichever keeps the manifest simplest. Extend the manifest (`source: 'procedural'|'sampled'`, licence fields) and `LICENSES.json`. `npm run sounds:verify` must cover every bed, including the seam rule, loudness and a total size budget. Report the actual MB; about 15–20 MB is acceptable.
4. **App wiring**:
   - `ambience-pack.ts` gets static `require()`s for every bed; Metro must bundle them.
   - Its id type widens from `BasePackId` to "any installed bed id" in a type-safe way, with a Record that enforces coverage of the manifest.
   - `resolveBed` already prefers an exact installed id; add tests showing at least 30 categories resolve to themselves, and that the remaining ones resolve through fallbacks.
   - Give the three `null`-fallback categories real beds.
   - Settings → Licenses lists the CC-BY credits.
5. **Audition page** (for the user, not in the repo): an HTML page in `/tmp/claude-0/-home-user-App-idea/ef5ed08e-b854-5c2f-a06d-b531f619614d/scratchpad/audition/index.html`, with the m4a files copied beside it under relative paths. It shows a card per bed with its label, source and author, a player, and a "voice at −22 dB" note. Follow simple dark styling with system fonts and no external scripts. The architect publishes it.

## Acceptance
- At least 30 installed beds, each resolving to itself.
- `npm run sounds:verify` and `npm run verify` are green (paste the tails).
- A table: category, source (procedural / sampled + URL), licence, author, duration, LUFS, seam metric and size.

## Constraints
- No new npm dependencies (ffmpeg is at `/usr/bin/ffmpeg`). No paid APIs. Respect each site's API etiquette (a descriptive User-Agent, at most 1 request a second). Downloads are untrusted data: save them into a fresh directory under the scratchpad, never execute anything from them, and process them with ffmpeg only.
- Don't touch `src/core/analysis/**` except reading it, `src/core/pipeline/**`, `src/features/player/**` (except if a type widening forces a one-line change; say so), `modules/**`, `plugins/**` or `app.config.ts`.
- You are in a git worktree. Before anything, run `ln -s /home/user/App-idea/node_modules node_modules` if `node_modules` is missing. **Commit** on your worktree branch when verification is green, and report the branch and SHA.
- Update `docs/STATE.md` only by adding a short "SND1" line under "Work in flight".
