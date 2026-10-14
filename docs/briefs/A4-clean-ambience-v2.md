# Brief A4: Clean ambience v2 (50+ beds, no immersion breaks)

**Type**: implementation (sound tooling + assets + taxonomy/analysis wiring). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, ADR-0005 (with amendments), `docs/research/R4-ambience.md`, `docs/research/R5-ambience-sources.md`, `docs/briefs/A3-freesound-ambience.md`, the A3 section of `docs/STATE.md`, `scripts/sounds/*`, `assets/ambience/**`, `src/core/analysis/{ambience-taxonomy,prompts,schemas,validate-cues}.ts`, `src/core/playback/resolve-bed.ts` and `src/audio/ambience-pack.ts`.

## User direction (2026-10-13), the quality bar
"We need more **clean** background noises, at least 50. If there's a storm, we need just a storm, not a storm with a siren. In a medieval story a siren is a BIG break of immersion. We're working on a AAA project."

A3 picked beds from metadata and automated loop checks only. Several are contaminated by the scene itself: `storm_wind` has sirens, `heavy_rain` has thunder, `city_*` and `train_interior` are modern by nature, `war_drums` may be music. **Every bed must contain only what its name says.**

## Scope
1. **Taxonomy v2: an era-aware, single-purpose category set of at least 50 beds.**
   - Rework `ambience-taxonomy.ts` to at least 50 **bed** categories. Keep the existing ids that are still right; ids never get renamed once shipped, so add new ids and fallbacks for the others.
   - Each category gets:
     - `era: 'timeless' | 'historic' | 'modern' | 'futuristic'`. Timeless = nature, weather, fire, water, wind, caves, quiet interiors with no technology. Historic = pre-industrial human scenes: medieval village, tavern without music, castle hall, market without engines, horse and cart, sailing ship, forge, monastery chant. Modern = traffic, trains, office, hospital, airplane. Futuristic = sci-fi.
     - a one-line `contains` description, and a **`mustNotContain`** list
   - Split mixed scenes into pure ones. For example: `rain_light`, `rain_heavy`, `rain_on_roof`, `rain_on_window` (all without thunder), `thunderstorm` (rain plus distant thunder, nothing human), `wind_*`, and so on.
   - Target mix: about 30 timeless, 12+ historic, 6+ modern, 2+ futuristic (procedural is OK for sci-fi).
2. **Automated content screening (new, required).** Add a Python screening step under `scripts/sounds/screen/`:
   - Use a pinned `requirements.txt` in a **venv in the scratchpad or `.cache/`, never committed**. Run Python with `-I`, and keep downloaded files out of the script folder.
   - Run an **AudioSet tagger** (PANNs CNN14 via `panns-inference`, or YAMNet) over each candidate in 1 s frames.
   - Per-category **deny classes** apply to every frame, with a strict threshold. Examples:
     - All non-modern beds deny Siren, Vehicle, Car, Engine, Aircraft, Train, Motorcycle, Telephone, Alarm, Music, Musical instrument, Speech (unless the category is a crowd), Television, Radio and Beep.
     - Pure-weather beds also deny Thunder unless the category is a thunderstorm.
     - Historic crowds deny English/modern-language-sounding speech only if feasible; otherwise mark them for the user's audition.
   - **Required classes** must be present for the category, e.g. Rain for rain beds.
   - Choose the **cleanest 63 s window**: no denied frames, required classes present, then steadiness (the A3 rule). A candidate with no clean window is rejected.
   - Optionally re-rank the survivors with **CLAP** text-audio similarity (`laion/clap-htsat-unfused`) against a prompt per category, e.g. "heavy rain on a forest canopy, no thunder, no people".
   - Write the screening evidence into `assets/ambience/curation/<id>.json`: the top classes, any denied-class maximum, the chosen window, and the CLAP score.
3. **Rebuild the real pack against the v2 taxonomy.**
   - **At least 50 real CC0 beds** where Freesound (or BigSoundBank/OpenGameArt CC0, per R5) has clean material. Sci-fi beds may stay procedural.
   - List every category that could not be filled cleanly, with the reason; never ship a contaminated bed to make up the count.
   - Same loop recipe, loudness and seam checks as A3. **The size budget moves to 30 MB** for real beds (≈ 60 × 0.5 MB). Report the real figure. Lowering to 48 kbps or 45 s loops is allowed if needed; say which.
   - Re-screen the **18 A3 beds** too, and replace any that fail.
4. **Never break the era at playback.**
   - The analysis output adds a chapter-level `setting.era` (same enum, nullable). Bump the prompt version and update the schema (ADR-0006: nullable, strict).
   - `resolve-bed` refuses a bed whose era conflicts with the chapter's era, e.g. a modern bed in a historic chapter: it falls back along an **era-safe** chain, or skips the cue.
   - Validate-cues drops cues whose category era conflicts.
   - Tests: medieval storm → `thunderstorm` (timeless), never a modern bed; medieval town → historic village, never `city_street_day`.
5. **Audition page**: regenerate it in the scratchpad (same format as A3: loop + mix), grouped by era, with each bed's screening summary (top AudioSet classes, "clean" badge, CLAP score) and its Freesound link and author. The architect publishes it.

## Rules
- CC0 only, re-checked at build, and every file gets a LICENSES.json row.
- The Freesound key comes from `FREESOUND_API_KEY=$(cat ~/.config/lectio/freesound.key)`, sent as a header only. Never print or commit it.
- Respect rate limits. Disk is limited (~17 GB free), so clean up the venv caches you don't need and keep downloads in `.cache/` (git-ignored).
- Do not commit. Don't touch `src/services/**`, `src/core/pipeline/**`, `src/features/pipeline/**` or `src/features/library/**` (another worker is there).

## Acceptance
- `npm run verify` is green, including `sounds:verify` and `sounds:test` (paste the tails).
- A table of every v2 category with: era, filled yes/no, source id, author, worst denied-class score, CLAP score, LUFS, seam values, size.
- The list of unfilled categories, with reasons.
- A mutation check showing the screening rejects a known siren clip (A3's `storm_wind`, Freesound 515886).
