# Brief A3: Realistic ambience beds from Freesound (CC0 only)

**Type**: implementation (build tooling + curated assets). **Unblocked 2026-10-12**: the architect verified the Freesound API (search with the key → 200, 6,193 CC0 rain results) and the HQ preview CDN (200). Read `docs/research/R5-ambience-sources.md` first: it ranks the categories and names CC0 fallbacks. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, **ADR-0005** (with its amendments), `docs/research/R4-ambience.md`, `scripts/sounds/*` (the base-pack build: seamless loop with roll, −28 LUFS, AAC 64 kbps mono, manifest, LICENSES.json, verify), `src/audio/ambience-pack.ts`, `src/core/playback/resolve-bed.ts` and `src/core/analysis/ambience-taxonomy.ts`.

## Goal
Replace the synthetic beds with **real recordings** wherever the taxonomy needs them: horses, sword battle, tavern crowd, forest by day and night, rain on leaves and roofs, thunderstorm, river, ocean shore, city street, market, campfire, cave, ship deck, train, temple and so on. Start with **the ~24 categories the analysis model picks most** (rank them from the taxonomy's families and the R4 notes; justify the list). Every other category keeps its fallback chain.

## Secret handling (strict)
The user's Freesound API key is stored **outside the repo** in `~/.config/lectio/freesound.key` (mode 600).
- Scripts read it from the env var `FREESOUND_API_KEY`, which callers set with `FREESOUND_API_KEY=$(cat ~/.config/lectio/freesound.key)`.
- Never print it, log it, write it to any repo file, or put it in a command shown in a report. Redact it from any captured output.

## Scope
1. `scripts/sounds/freesound-curate.mjs`: for each target category, search the Freesound API v2 (`/apiv2/search/text/`):
   - filter `license:"Creative Commons 0"` and duration 30–600 s; fields `id,name,tags,description,duration,license,avg_rating,num_ratings,num_downloads,username,url,previews,samplerate,channels`
   - rank by a score combining rating (with enough ratings), downloads, duration ≥ 60 s, tags matching the category, and **penalties** for tags or names like music, voice, speech, talking, loop-with-music, synth, sfx-hit, beep, and very short clips
   - write `assets/ambience/curation/<category>.json` with the top 5 candidates and the reasons, to review in git
2. Download **only the HQ MP3 preview** (`previews['preview-hq-mp3']`), which needs no OAuth. CC0 applies to the sound itself.
3. `scripts/sounds/build-freesound-pack.mjs`: for the chosen candidate per category (top score unless overridden in `assets/ambience/curation/overrides.json`):
   - trim silent or noisy edges
   - pick the steadiest 63 s window (the lowest short-term loudness variance)
   - high-pass at 25 Hz
   - process with **exactly the base pack's loop recipe** (roll, crossfade, two-pass loudnorm to −28 LUFS, AAC-LC mono 64 kbps, frame-aligned loop region): reuse `ffmpeg-tools.mjs` and `pack-spec.mjs`, refactoring shared code rather than copying it
   - write `assets/ambience/real/<category>.m4a`
   - extend `manifest.json` (`source: 'freesound'`, `freesoundId`, `author`, `url`) and **`LICENSES.json`** (CC0, author, source URL, download date)
4. `verify-pack.mjs` covers the new beds: loudness, true peak, the statistical seam rule and the size budget. The budget is now about 15 MB for real beds; report the actual figure.
5. App wiring:
   - `src/audio/ambience-pack.ts` gets static `require()`s for the new beds (Metro must bundle them)
   - `resolve-bed.ts` prefers an installed real bed for the exact category before the fallback chain
   - the taxonomy's labels and icons are unchanged
   - add tests for resolution order
6. **Audition page for the user**: an HTML file in the scratchpad (not the repo) with each new bed's player, its category, its Freesound link and author, and a 20 s mix under a −22 dB voice placeholder. The architect publishes it.

## Additions (2026-10-12, from R5)
- Use R5's ranked list of 24 categories, minus the 6 it assigns to AI generation (not in scope now). Build the other ~18 from Freesound CC0.
- When Freesound has no good CC0 candidate for a category, you may use **BigSoundBank** (only files whose own page says CC0) or **OpenGameArt** (only files marked CC0). Record the source page URL and the quoted licence line in LICENSES.json.
- Every candidate must be CC0. Reject a candidate if its licence is anything other than exactly CC0 (e.g. `http://creativecommons.org/publicdomain/zero/1.0/` on Freesound).
- Use the **HQ MP3 preview** (128 kbps). It is enough for a 64 kbps mono AAC bed. Do not use OAuth downloads.

## Constraints
- Do not run `npm install`. Do not commit. Respect Freesound API rate limits (2,000 requests a day, 60 a minute), with throttling and retries.
- CC0 only. Do not use a sound if its license field isn't exactly CC0.

## Acceptance
- `npm run sounds:verify` and `npm run verify` are green (paste the tails).
- A table of the categories, each with the chosen Freesound id, author, duration, LUFS, seam values and size.
