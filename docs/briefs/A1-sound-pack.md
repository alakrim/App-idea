# Brief A1: Procedural base ambience pack (build pipeline + assets)

**Type**: implementation (build tooling + generated assets). Read `CLAUDE.md`, `docs/CONVENTIONS.md`, **`docs/decisions/0005-ambience.md`**, **`docs/research/R4-ambience.md`** (the procedural recipes and the loop recipe that was verified to work) and `src/core/analysis/ambience-taxonomy.ts` (the base-pack ids: `base_rain`, `base_wind`, `base_ocean`, `base_crowd`, `base_space_hum`, `base_fire`).

## Goal
A reproducible Node script that synthesizes **six high-quality, seamless, loudness-normalized ambience beds** with system `ffmpeg` (6.1 at `/usr/bin/ffmpeg`), plus the manifest the app loads. Licensing risk is zero because we generate everything.

## Scope
1. `scripts/sounds/build-base-pack.mjs` (Node ESM, using `execFile` with argument arrays and no shell strings) generates into `assets/ambience/base/`:
   - `base_rain.m4a`, `base_wind.m4a`, `base_ocean.m4a`, `base_crowd.m4a`, `base_space_hum.m4a`, `base_fire.m4a`
   - Synthesize 75 s, then make a **seamless loop** of ~60 s using R4's verified `afade qsin` + `amix` + `concat` equal-power crossfade (3 s overlap).
   - Encode AAC-LC mono 64 kbps at 44.1 kHz and normalize to **−28 LUFS integrated** (two-pass `loudnorm`, or the verified ebur128 approach).
   - **Quality bar**: these must sound credible under narration, not like raw noise. Use layered recipes:
     - rain: pink and brown noise through band-passes, plus sparse droplet transients via random-impulse filtering
     - wind: brown noise with a slow LFO on a resonant band-pass
     - ocean: brown noise with a 7–11 s swell envelope plus a high-shelf wash on the peaks
     - crowd: several detuned formant-filtered noise layers with slow random amplitude ("murmur") and no intelligible content
     - space hum: low sine/triangle drones (40–80 Hz), slow beating and a filtered noise bed
     - fire: brown-noise rumble plus random crackle transients (high-passed impulses at irregular intervals)
   - Determinism: seed every random source (ffmpeg `anoisesrc` `seed=`, `aevalsrc` with a fixed seed), so rebuilds are byte-stable or at least perceptually identical. Document which.
2. `assets/ambience/base/manifest.json`: `[{ id, file, durationMs, loopStartMs: 0, loopEndMs, lufs, bytes, sha256, kind: 'bed', source: 'procedural', recipeVersion }]`.
3. `assets/ambience/LICENSES.json`: the ledger. Each procedural entry has `{ id, license: 'Proprietary (generated in-house)', source: 'scripts/sounds/build-base-pack.mjs', author: 'Lectio', date }`. Include a JSON schema comment in a README.
4. `scripts/sounds/verify-pack.mjs` checks every manifest file: it exists, its duration is within ±50 ms, integrated loudness is −28 ± 1 LUFS, true peak ≤ −3 dBTP, and **seam continuity** (RMS of the last 50 ms vs the first 50 ms within 2 dB, and no sample discontinuity spike at the boundary larger than 6× the median absolute sample delta). It exits non-zero on failure. Add `npm` scripts `sounds:build` and `sounds:verify`. **This is the only package.json edit allowed.**
5. `src/audio/ambience-pack.ts`: a typed loader mapping category id → `require()`d asset module plus manifest metadata (static requires so Metro bundles them), and `resolveBed(categoryId)`, which walks the taxonomy `fallback` chain until it hits an installed bed or returns null. Add a Node test for `resolveBed` (put that test in `src/core/analysis` if it is pure, or make the resolver pure in `src/core/playback/resolve-bed.ts` and keep `src/audio/ambience-pack.ts` as the require map only).
6. Run `npm run sounds:build && npm run sounds:verify` and include the verify output plus the file sizes. Also produce a 20 s **audition mix** per bed, with a sine-tone "voice" placeholder at −22 dB relative (keep these only in the scratchpad, never in the repo), to sanity-check levels. Report the measured RMS/LUFS.

## Constraints
- Do not run `npm install`. Do not commit. Only touch `scripts/sounds/**`, `assets/ambience/**`, `src/audio/ambience-pack.ts`, optionally `src/core/playback/resolve-bed.ts` (+ test), and the two npm scripts.
- Another worker owns the rest of `src/audio/**` and `src/core/playback/**` concurrently. Coordinate through the file boundaries above.

## Acceptance
- Both scripts run clean, and assets are < 3 MB total.
- `npm run typecheck`, lint and tests pass for the files you touched (paste the tails).
