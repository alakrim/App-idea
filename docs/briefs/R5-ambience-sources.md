# Brief R5: Where realistic ambience can come from (beyond Freesound)

**Type**: research (web + live reachability checks). Output: `docs/research/R5-ambience-sources.md`. Read `CLAUDE.md`, ADR-0005 (and amendments), `docs/research/R4-ambience.md`, `docs/briefs/A3-freesound-ambience.md`, `src/core/analysis/ambience-taxonomy.ts` and `assets/ambience/README.md`.

## Context
The app plays looping ambience beds (rain, tavern, forest, battle, city, sea…) under the narration. Today they are procedural (synthesised), and the user wants real, premium-sounding beds. Freesound was the plan, but **Freesound refuses this cloud machine's IP** (HTTP 403 from Freesound's own server; other hosts work). `api.openverse.org` is reachable and indexes Freesound's CC0 metadata, but the audio files live on `cdn.freesound.org` (blocked). The user says Freesound is "just one of the tools" and wants the wider options researched.

## Questions to answer
1. **Libraries we can bundle in a commercial mobile app.** Candidates to check, plus any you find:
   - Wikimedia Commons (PD/CC0 audio)
   - BigSoundBank
   - Sonniss GDC bundles
   - Pixabay sounds
   - Zapsplat
   - Mixkit
   - BBC Sound Effects (RemArc licence)
   - OpenGameArt
   - Internet Archive collections
   - SoundBible
   - freesound mirrors (Openverse)
   - Kenney
   - the "Soundly" free tier

   For each:
   - the exact licence terms on **redistribution inside an app binary**, attribution, and commercial use
   - whether an API or bulk download exists
   - typical quality (sample rate, length, loopability)
   - category coverage against our taxonomy
   - **live reachability from this container**: `curl` status code for the site, and for one real file URL
2. **AI generation of ambience.** Candidates:
   - ElevenLabs Sound Effects API (max duration, loop option, price, licence of the output)
   - Stable Audio 2.x / Stable Audio Open (weights licence, commercial terms)
   - Meta AudioGen/MAGNeT (licence)
   - hosted options (fal.ai, Replicate)
   - whether **OpenRouter** offers any audio-generation (non-speech) model today (check the public `/api/v1/models` list)

   Give each: cost per 60 s bed and quality notes. Two use cases:
   - (a) the architect generates a curated pack once, offline
   - (b) the app generates per-scene beds at runtime with the user's own key (BYOK). Is that realistic, and at what cost per chapter?
3. **Recommendation.** A ranked plan to get **~24 high-quality, loop-clean beds** covering the most-used taxonomy categories, with:
   - the source per category
   - licence evidence (URL + quoted clause)
   - what can be fetched from this container today vs what needs the user's machine
   - the expected total pack size at AAC 64 kbps mono

   Also say whether a downloadable "HD ambience pack" (fetched on first use instead of bundled) changes the licence picture.

## Rules
- No paid API calls. No account sign-ups. Downloading 1–2 small sample files per reachable source **into the scratchpad only** (never the repo) is allowed to verify reachability and format. Report `ffprobe` of the samples if `ffprobe` exists.
- Quote licence text exactly, with the URL and the date checked. Flag anything ambiguous instead of assuming it is permitted.
- Do not commit. Do not edit code.

## Acceptance
- The report has a table per source (licence, redistribution in app: yes/no/unclear, API, reachability code, quality, coverage), the AI-generation table, and the ranked plan.
- Every "yes" for redistribution has a quoted clause.
