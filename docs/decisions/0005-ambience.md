# ADR-0005: Ambience beds: taxonomy, mix and sound sourcing

**Status**: accepted (2026-10-11). Evidence: `docs/research/R4-ambience.md`.

## Decision
- **Taxonomy**: the 59 categories in R4. v1 enables **beds only** (51). `kind: 'bed' | 'oneshot'` is reserved in the schema, and one-shots ship in v1.1. Ids are stable `snake_case` and never renamed.
- **Mix**: at most 2 simultaneous beds. Default bed level is −22 dB relative to narration, user-adjustable from −30 to −14 dB or off. Narration-aware ducking is an extra 6–9 dB while the voice is active (attack 30 ms, release 550 ms). Fade-in is 2.5 s by default and fade-out 3 s. Crossfade when one bed replaces another.
- **Cue validation**: minimum span 3 sentences / about 20 s; at most 2 cues per 1k words; never more than 2 overlapping beds; drop cues with confidence < 0.55; merge adjacent identical categories.
- **Format**: AAC-LC `.m4a`, 44.1 kHz, mono 64 kbps, 30–60 s seamless loops, normalized to −28 LUFS integrated. Loops are made by the build script `scripts/sounds/` (ffmpeg with an equal-power `afade qsin` crossfade, the recipe from R4).
- **Sourcing policy**: CC0 first. The **base pack v0 is procedural** (rain, wind, ocean, crowd murmur, space hum, fire), synthesized by our build script, so licensing risk is zero. Sampled CC0 beds (Freesound CC0, OpenGameArt CC0, Kenney) are added through `assets/ambience/LICENSES.json` (a ledger entry per file: source URL, author, license, date). CC-BY content only goes in with an in-app credits screen. NC, SA, GPL and Sampling+ are never used.
- **Unmapped categories**: if a cue's category has no installed sound, the player maps it to its family fallback bed (e.g. `horse_gallop` → `countryside_wind` family fallback) or silently skips it. The analysis still stores the true category, so better packs light it up retroactively.
- `ffmpeg-static` (GPL) is a **build-time devDependency only** and never ships.

## Amendment (2026-10-11): minimum cue span 12 s (was 20 s)
The live test showed a typical 4-sentence Mandarin scene (~70 Han characters, ~15 s at 4.5 chars/s) being dropped. The floor is now **12 s of estimated narration plus ≥ 3 sentences**, the same rule for every script (durations come from `text/speech-rate`). With the default 2.5 s fade-in and 3 s fade-out, a 12 s bed still holds full level for about 6 s, so beds don't feel jittery.

## Amendment 2026-10-17 (user request: reliable cues, 30+ sounds)
- **Coverage over caution.** Every scene with an identifiable setting gets the matching bed, even when no sound is named. Mood beds still need explicit evidence. Coverage goal: 40–80 % of the narration when settings are identifiable (prompt v3, brief AM1).
- **Thresholds.** The confidence floor drops 0.55 → 0.45 and the density cap rises 2 → 3 cues per 1,000 words. Min span is unchanged (3 sentences, 12 s).
- **Reproducibility.** Analysis runs at temperature 0 with a fixed seed. Validated cues are cached by text hash, model and prompt version, so the same chapter text always gets the same cues.
- **Fallback.** A chapter of at least 200 words with zero valid cues gets one "dominant setting" call (at most one bed).
- **Licences.** CC0 and Public Domain are preferred. CC-BY 3.0/4.0 is allowed, with attribution in `LICENSES.json` and Settings → Licenses. NC, ND, SA and no-redistribution licences are excluded.
- **Pack size.** At least 30 installed beds with exact-id resolution (brief SND1), with a budget of about 20 MB.
