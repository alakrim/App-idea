
## A4 status (2026-10-14): partial, phase 2 running
- **Built:**
  - Taxonomy v2: 65 beds, each with `era`, `contains` and `mustNotContain`; the `analysis-v3` prompt outputs a chapter `era`; validate-cues drops cues that conflict with the era; resolve-bed is era-safe.
  - AudioSet (PANNs) + CLAP screening with per-clip persistence.
  - Real beds at 48 kbps, 60 s loops.
  - Mutation: the A3 siren storm (515886) is rejected; with no rules it passes.
- **Result: only 12 real beds pass** (4.5 MB):
  - timeless: forest by day and night, river, waterfall, cave, meadow, snowfall, library
  - historic: crowd murmur
  - modern: city by day and night, train

  The other 49 fail on supply: the required sound is absent, or a sound is denied, or the clip is shorter than 64 s, and the rain beds miss −28 ±1 LUFS by 0.1 dB at the true-peak ceiling. Sci-fi stays procedural.
- **Architect decisions for phase 2:**
  - A limiter before the final loudnorm, real beds only; the base pack stays byte-identical.
  - 45 s loops allowed for clips of 46–63 s.
  - 25 candidates per category plus alternate queries, and BigSoundBank/OpenGameArt CC0 as second sources.
  - The thresholds are unchanged.
- **Open:**
  - **Era persistence**: `era` is not yet stored on the chapter or passed to `resolveInstalledBed`. It needs the analyze stage and the player store; it is a follow-up brief after F3.
  - An ADR-0005 amendment: 24 MB, 48 kbps, 45/60 s loops, screening thresholds, era rules.
  - `cave_drip` peak at exactly −3 dBTP.
- **AI-generated beds** (castle hall, forge, battlefield…) would need ElevenLabs on a paid plan: the user's decision.

## Paused (2026-10-14): the user is low on tokens
- **Delivered:** APK `lectio-0.1.0-54b3d2e-arm64.apk` on `apk-builds`, built from the last fully verified commit `54b3d2e` (N2–N4, L1, F1, F2, F4). It is 51.3 MB, with SHA-256 `2a662f29…0a91` and the same debug key. The manifest has `FOREGROUND_SERVICE_DATA_SYNC` and `POST_NOTIFICATIONS`.
- **Paused, unverified, in wip commits:**
  - **F3** (data integrity): partial.
  - **A4 phase 2** (clean ambience): partial. The limiter is done and the base pack is proven byte-identical; 45 s loops and the wider sourcing are not done.
  - Resume either one by re-briefing a worker from its brief plus this note.
- **Next when resuming:**
  - Finish F3 and A4.
  - Era persistence.
  - Device checks: background service, resume, bookmarks.
