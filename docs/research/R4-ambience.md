# R4: Ambience sound library and cue design research

**Date**: 2026-10-11
**Brief**: `docs/briefs/R4-ambience-sound.md`
**Scope**: research only. No app code and no repo files changed other than this report.

## TL;DR

- **Licensing**: bundling is feasible under a CC0-first policy. CC0 sources (Freesound CC0 filter, OpenGameArt CC0 files, Kenney audio, BigSoundBank pending licence check) are green. Sonniss GDC bundles are likely fine embedded in a finished app but are a grey area for raw files. Pixabay is amber because of its "Standalone" prohibition. CC-BY needs an in-app credits screen. CC-BY-NC and share-alike content is excluded from the base pack.
- **Taxonomy**: 59 categories (51 beds, 8 one-shots) in 9 families, with stable snake_case ids (section 2).
- **Layering**: v1 supports **beds only, max 2 simultaneous**. Defer one-shots to v1.1 and reserve `kind` in the schema. Default bed level is **-22 dB under narration** (range -18 to -24), with sidechain ducking of 6 to 9 dB while speech is active. The ducking figures are heuristics; I found no audiobook-specific standard.
- **Format**: **AAC-LC in m4a**, mono 64 kbps for beds, 44.1 kHz. Ogg/Opus is not a safe iOS choice (secondary sources say iOS cannot play Opus in Ogg). Opus-in-CAF is possible but unverified for us.
- **Budget**: 51 beds of 60 s mono AAC at 64 kbps is about 24.5 MB. A base pack of about 25 MB is far below the Play base limit (200 MB) and the iOS cellular threshold (200 MB, 2019 source). Stereo and extra packs go downloadable.
- **ffmpeg**: installed here (`/usr/bin/ffmpeg`, 6.1.1). apt reports it as already at the newest version. `ffmpeg-static@5.3.0` installs from npm and runs (it bundles a static GPL ffmpeg 7.0.2, build-time only, never ship it). ffmpeg is usable in a Node build script.
- **Loop recipe**: I corrected a pitfall. The `acrossfade` variant I first tried produced **empty output** when the tail equals the crossfade length. The working recipe uses `afade` (qsin curves, verified equal-power) + `amix` + `concat`. Tested end to end: a 40 s source gives a 38.00 s loop at -28.0 LUFS, about 66 kbps AAC.
- **Procedural fallback**: rain, wind, ocean, crowd murmur, space hum and fire crackle all synthesize with ffmpeg built-ins (section 6). They run and measure plausibly, but I could not audition them. A listening test is required before any is shipped as a base-pack bed.

---

## 1. Sources of redistributable audio

Verdict key: **green** = bundle and redistribute as-is with attribution where required; **amber** = allowed under conditions, get clarification or process the files first; **red** = do not use in the base pack.

| Source | Licence summary (verified where noted) | Attribution | Bundle in app binary / CDN? | Verdict |
|---|---|---|---|---|
| **CC0 1.0 deed** | Waives copyright worldwide. Commercial use and modification allowed. No warranty ([CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/), fetched). | Not required. Do not imply endorsement. | Yes, in binary or CDN. | Green (baseline) |
| **Freesound (filter CC0)** | The FAQ says of CC0: "you can do pretty much what you want with the sound", and that you "could even sell the sound", but you "can't claim you are the author!" ([Freesound FAQ](https://freesound.org/help/faq/), fetched). Licence is **per file**: CC0, CC-BY or CC-BY-NC. Use the CC0 filter. | None for CC0. | Yes for CC0. The FAQ does not address app redistribution directly; CC0 covers it. | **Green** (CC0 only) |
| **Freesound (CC-BY)** | Attribution required. Commercial use allowed per the licence (the FAQ does not spell it out). Remixes must attribute every link in the chain ([FAQ](https://freesound.org/help/faq/)). | Required: credit per sound (author, title, licence). | Yes, with a credits screen. | Amber (manageable) |
| **Freesound (CC-BY-NC, Sampling+)** | Non-commercial only. Sampling+ is legacy and being removed by Creative Commons ([FAQ](https://freesound.org/help/faq/)). | Required. | **No** for a commercial app. | **Red** |
| **Sonniss GDC bundles** | Licence: worldwide, non-exclusive, royalty-free. Use "on an unlimited number of projects for the entirety of their life time". No attribution required. Permitted in "games, film, TV, and interactive projects" and "as part of your finished game, film, app". **Restricted**: "Licensee may not distribute, publish, sub-license or otherwise supply the sound effects as sound effects" (raw redistribution). "Use for AI/ML training is strictly prohibited" ([Sonniss GDC page](https://sonniss.com/gameaudiogdc/); [licence text](https://sonniss.com/gdc-bundle-license/), both fetched; quotes limited by the fetch tool). | Not required. | **Probably yes, embedded in a finished app.** Raw extraction by users is the risk: shipping loose wav/m4a files could count as supplying sounds "as sound effects". Ship processed loops only and get written confirmation. | **Amber** |
| **Pixabay** | Content licence permits copy, modify, distribute and commercial use; attribution not required ([FAQ](https://pixabay.com/service/faq/)). Prohibited uses include: "You cannot sell or distribute Content (either in digital or physical form) on a Standalone basis. Standalone means where no creative effort has been applied to the Content and it remains in substantially the same form" ([Content License Summary](https://pixabay.com/service/license-summary/), fetched). The fetch did not capture the full prohibited-uses list, and the summary says the full licence is the binding text. | Not required. | Raw files bundled in an app are close to the Standalone prohibition. Processed loops are safer but still uncertain. | **Amber** (avoid for raw files) |
| **Kenney** | "all game assets on the asset pages are public domain licensed (CC0)". "You're free to use them, even in commercial projects." "Attribution is not required." The page does not mention audio explicitly ([kenney.nl/support](https://www.kenney.nl/support), fetched). Secondary sources list Kenney audio packs (Impact, Interface, RPG audio) as CC0 ([OpenGameArt search results](https://opengameart.org/content/50-rpg-sound-effects); [Defold listing](https://defold.com/assets/kenney)). | Not required. Do not use the Kenney logo. | Yes. | **Green**, verify each pack's licence file |
| **BigSoundBank** | Site says sounds are "made available free of charge and freely for all your projects, whether commercial or not, and worldwide". Full licence page not retrieved. A sound page cites "public-domain equivalent" with CC0, WTFPL or public domain. The Horn #3 page (search result) contains a stray reference to another site, so the licence text looks partly templated ([bigsoundbank.com](https://bigsoundbank.com/), fetched; search results). | Not required per search summaries; credit appreciated. | Unconfirmed. | **Amber**: read the licence page and get it in writing before use |
| **OpenGameArt** | **Per file.** Examples: "Loopable Dungeon Ambience" is CC0 ([page](https://opengameart.org/content/loopable-dungeon-ambience)). Mixes can change the licence: one mix combining CC0 and CC-BY 3.0 tracks was listed as CC-BY 3.0, and the creator noted that a CC0-only version could be CC0. Some packs are CC-BY-SA (share-alike, a copyleft risk). Some purchasable products have different terms (LEGIT Audio example). | Depends on file. | Only for files marked CC0 (or CC-BY with credits). | **Green for CC0 files only**; check each file |

**Flags**
1. **Do not use any CC-BY-NC, Sampling+, CC-BY-SA or GPL content in the base pack.**
2. Keep a **licence ledger** for every bundled file: source URL, author, licence, download date. Put it in the repo, for example `assets/audio/LICENSES.csv`, when assets are added.
3. Never use any of these sources to train or fine-tune models (Sonniss forbids it explicitly).
4. Sonniss and Pixabay: get written confirmation that embedding processed loops in a commercial app is covered before the base pack ships.

**Recommended base-pack policy**: CC0 only (Freesound CC0 filter, OpenGameArt CC0 files, Kenney). Sonniss and Pixabay only after written confirmation. CC-BY only if a credits screen is part of the product.

## 2. Taxonomy

59 categories: **51 beds** (loop) and **8 one-shots**. Families: nature, weather, urban, interiors, transport, combat, mystical, sci-fi, mood (tension, romance, horror, thriller, plus non-fiction stillness). Ids are stable `snake_case`. The description column is written to be pasted into the LLM prompt.

| id | family | type | description (LLM prompt) |
|---|---|---|---|
| `forest_day_birds` | nature | bed | Daytime forest with birdsong, light leaf rustle, distant woodpecker. |
| `forest_night` | nature | bed | Night forest: crickets, an occasional owl, soft wind in trees. |
| `open_field_wind` | nature | bed | Open grassland or moor, steady wind through grass, no birds. |
| `mountain_wind` | nature | bed | High exposed mountain wind with cold gusts and sparse echo. |
| `ocean_waves` | nature | bed | Surf on a beach, rhythmic waves with a slow swell. |
| `river_stream` | nature | bed | Flowing stream or river over stones. |
| `jungle_insects` | nature | bed | Tropical jungle: insects, distant monkeys, dripping foliage. |
| `light_rain` | weather | bed | Gentle steady rain on leaves or ground. |
| `heavy_rain` | weather | bed | Downpour, dense steady rain. |
| `storm_wind` | weather | bed | Storm: strong gusts, rain, distant rolling thunder. |
| `snowfall_quiet` | weather | bed | Muffled quiet of falling snow. |
| `blizzard_wind` | weather | bed | Howling snow wind, harsh and cold. |
| `thunder_clap` | weather | one-shot | Single close thunder crack. (v1.1) |
| `city_street_day` | urban | bed | Busy city street by day: traffic, footsteps, distant voices. |
| `city_night` | urban | bed | Night city: light traffic, distant sirens, humming signs. |
| `market_crowd` | urban | bed | Open market or bazaar: vendors calling, many voices. |
| `village_square` | urban | bed | Small village square, few voices, a cart, a dog barking. |
| `harbor_port` | urban | bed | Port: gulls, ropes, distant cranes, water against hulls. |
| `crowd_murmur` | urban | bed | Large crowd murmuring; no distinct words. |
| `tavern_crowd` | interiors | bed | Busy tavern: many conversations, clinking mugs, distant laughter. |
| `castle_hall` | interiors | bed | Large stone hall with faint echo and distant footsteps. |
| `fireplace_crackle` | interiors | bed | Crackling fire in a room, soft pops. |
| `kitchen_busy` | interiors | bed | Kitchen at work: pots, chopping, sizzling, voices. |
| `office_hum` | interiors | bed | Modern office: HVAC hum, keyboards, faint phones. |
| `library_quiet` | interiors | bed | Library: near silence, page turns, soft room tone. |
| `hospital_ward` | interiors | bed | Hospital ward: distant monitors, carts, low voices. |
| `prison_cell` | interiors | bed | Stone cell with dripping water and distant metal echoes. |
| `cafe_soft` | interiors | bed | Quiet cafe, soft chatter, cups clinking. |
| `lecture_hall` | interiors | bed | Lecture hall: quiet audience rustle, distant HVAC. |
| `door_slam` | interiors | one-shot | Single heavy door slam. (v1.1) |
| `horse_trot` | transport | bed | Horse walking or trotting on a dirt road, hooves, light tack creak. |
| `horse_gallop` | transport | bed | Fast gallop, pounding hooves, breath and leather. |
| `carriage_wheels` | transport | bed | Wooden carriage on road, wheels creaking, harness jingle. |
| `ship_deck` | transport | bed | Wooden sailing ship at sea: ropes, creaking hull, sails. |
| `train_interior` | transport | bed | Train carriage: rhythmic wheels on rail, muffled cabin. |
| `airplane_cabin` | transport | bed | Airplane cabin: steady engine drone, muffled air. |
| `battle_field` | combat | bed | Distant battlefield: shouts, clashing metal, horns. |
| `war_drums` | combat | bed | Drums and horns of an approaching army, tense. |
| `gunfight_ambient` | combat | bed | Distant gunfire with echoes and shouting. |
| `arena_crowd` | combat | bed | Stadium or arena crowd cheering or jeering. |
| `sword_clash` | combat | one-shot | Single steel-on-steel clash. (v1.1) |
| `gunshot` | combat | one-shot | Single gunshot. (v1.1) |
| `explosion_distant` | combat | one-shot | Distant boom with rumble. (v1.1) |
| `ritual_chant` | mystical | bed | Low chanted voices in a ritual, reverberant. |
| `temple_incense` | mystical | bed | Temple interior: soft bells, hushed chanting. |
| `qi_hum` | mystical | bed | Cultivation aura: low resonant hum, soft wind, faint shimmer. |
| `spirit_whispers` | mystical | bed | Faint ghostly whispers, eerie air. |
| `magic_shimmer` | mystical | one-shot | Spell cast with a rising shimmer. (v1.1) |
| `bell_toll` | mystical | one-shot | Single temple or church bell toll. (v1.1) |
| `starship_bridge` | sci-fi | bed | Spaceship bridge: low electronic hum, faint console tones. |
| `spaceship_engine` | sci-fi | bed | Deep engine rumble in a spaceship corridor. |
| `alien_atmosphere` | sci-fi | bed | Alien planet: strange wind, unfamiliar chirps, low drone. |
| `space_station` | sci-fi | bed | Space station: steady air handling, distant clanks. |
| `laser_blast` | sci-fi | one-shot | Single laser zap. (v1.1) |
| `tense_heartbeat` | mood | bed | Muffled heartbeat under silence, for suspense. Requires explicit tension in text. |
| `clock_ticking` | mood | bed | Slow ticking clock, tension. |
| `ominous_drone` | mood | bed | Low dark drone, horror atmosphere. |
| `ballroom_party` | mood | bed | Ballroom or party murmur: glasses, distant chatter. No music. |
| `rain_on_window` | mood | bed | Rain against window glass heard from a warm room; intimate scenes. |

**Notes**
- The taxonomy is genre-neutral by design. Xianxia cultivation is covered by `qi_hum`, `ritual_chant`, `temple_incense`, and `spirit_whispers`.
- Music is out of scope. Ambience cues must never introduce music.
- Brief bed-size for the base pack: 51 beds. Each id can have one or two variants later, served from downloadable packs.

**Recommendation on one-shots for v1**: **do not ship one-shots in v1.** Reasons:
- They need sample-accurate triggering synced to the sentence highlight. That is the riskiest part of the player.
- A battle bed (`battle_field`, `war_drums`) covers most combat scenes.
- Schema reservation keeps v1.1 easy. Add an optional `kind: "bed" | "oneshot"` field; v1 accepts only `"bed"`.

## 3. Layering and mix guidelines

| Parameter | Recommendation | Basis |
|---|---|---|
| Max simultaneous beds | **2** (a primary bed plus an optional secondary layer such as `rain_on_window` + `tavern_crowd`). | Practical limit for intelligibility and CPU. My judgement, not a cited standard. |
| Narration reference level | Narration normalised to a fixed level in the TTS pipeline. Third-party ACX summary: RMS about -23 to -18 dB, peaks around -3 dB, noise floor at or below -60 dB ([Audacity forum summary of ACX standards](https://forum.audacityteam.org/t/audible-com-qc-standards/29508), secondary). | Audiobook practice, secondary source. |
| Default bed level | **-22 dB relative to narration** while speech is active. Range **-18 to -24 dB**. `intensity` 0..1 maps linearly to -24 dB (0) to -16 dB (1). | BBC guidance (cited in a Salford/AES paper): "try taking the music down 4 dB" as a first test ([Salford repository](https://salford-repository.worktribe.com/OutputFile/1488623)). Broadcast loudness-range targets (dialogue vs background at least 7 LU; voice-over LRA 16 to 23 LU) from the same paper (Torcoli et al., AES 2019). Ambience sits lower than music. |
| Ducking under speech | **6 to 9 dB** sidechain reduction while the narrator is active. Attack 20 to 50 ms. Release 400 to 700 ms. | Video-editing guides (search summary; the specific guide was not pinned down) suggest 6 to 12 dB, 30 to 80 ms attack, 250 to 700 ms release. Narrowed to 6 to 9 dB for ambience. Heuristic. |
| Pause lift | When narration is silent for more than 1.5 s, raise the bed by about +4 dB, capped at -16 dB relative. | Mixing practice. Heuristic. |
| Two beds | Secondary bed 3 dB below primary. Combined bed level no louder than -18 dB relative to speech. | Heuristic. |
| Cue fade in / out | Default **fadeInMs 2500, fadeOutMs 3000**. Range 500 to 8000 ms. Scene change crossfade 2 to 4 s. Same-category continuation: no fade. | Heuristic. Audiobook fades are typically a few seconds. |
| Loop crossfade | 2 s for beds (4 s for pads or room tone, per an ambience loop tool; 20 to 50 ms for music, not used here). | [Ambience loop tool](https://elysiatools.com/ai/en/tools/audio-seamless-ambience-loop.md) and [loop maker](https://violetrecording.com/tools/loop-maker/) (secondary). |

**Verification gap**: I found no audiobook-specific published dB table for ambience under narration. Treat every number here as a starting point. Validate with a short listening panel on device before the constants are locked. The dB figures live in one config file, not scattered through the player.

## 4. File format, loop length, bitrate, budget

**Format decision: AAC-LC in an m4a (MP4) container, 44.1 kHz, mono 64 kbps for beds.**

Evidence:
- **Android**: AAC LC decode and encode are native. Opus decode is Android 5.0+ and Opus encode Android 10+. Ogg is decodable; MP4 Opus encode is Android 10+ ([Android media formats](https://developer.android.com/guide/topics/media/media-formats), fetched; the table's column order was inferred).
- **iOS**: AAC in m4a is native. Ogg Opus is **not** reliably playable on iOS. A third-party package states "iOS devices cannot play OPUS audio files in OGG format" ([ogg_caf_converter](https://pub.dev/documentation/ogg_caf_converter/latest/), secondary). Opus in CAF is reported to work (an Apple developer-forum thread and an iMessage reference; [Apple forum](https://developer.apple.com/forums/thread/722399), secondary). The Apple AVFileType reference page was fetched but its body was empty, so no first-party confirmation.
- **Opus**: better quality per bit, but the iOS path is unverified for us. Revisit only if size becomes a problem.

**Gapless and loop caveat**: AAC encoders add priming samples. ffmpeg writes an edit list in m4a, and AVPlayer and ExoPlayer should honour it, but this is **unverified on device**. Test a 38 s loop for an audible gap on both platforms before shipping. If there is a gap, fall back to CAF/PCM for loops or pad the head.

**Loop length**: 30 to 90 s seamless loops (brief). Recommend **60 s** for most beds and 90 s for rain, storm and crowd, to reduce audible repetition. Shorter than 30 s is audibly repetitive.

**Bitrate**
- Mono AAC 64 kbps: 60 s is about 470 KiB. Plenty for diffuse ambience under speech. Measured: 38 s gave 312 937 bytes (65.98 kbps effective).
- Stereo AAC 96 kbps for "wide" beds only (e.g. ocean, forest). Measured: 38 s gave 464 754 bytes.
- One-shots (v1.1): AAC 96 kbps, mono, 2 to 4 s.

**Budget** (computed from the measured bitrates):

| Pack | Content | Size |
|---|---|---|
| **Base pack** (bundled) | 51 beds, 60 s, mono AAC 64 kbps: 51 x 0.48 MB | about **24.5 MB** |
| Base pack, one-shots (v1.1) | 8 one-shots, 3 s, 96 kbps | about 0.3 MB |
| **Base pack total** | | **about 25 MB** |
| Downloadable: stereo wide beds | 10 beds, 60 s, stereo 96 kbps: 10 x 0.72 MB | about 7 MB |
| Downloadable: variants | Second variant per bed (different birds, different rain) | about 25 MB per pack |

**Store limits**
- Google Play: base module 200 MB (compressed), asset packs above that. Current help page says individual asset packs up to 1.5 GB. Older sources give different numbers, so use the Play Console help page ([Google Play limits](https://support.google.com/googleplay/android-developer/answer/9859372), from search results; not fetched). Base pack of 25 MB is far under either figure.
- iOS App Store: 200 MB cellular download cap. Source is from 2019 and may be outdated ([TechCrunch](https://techcrunch.com/?p=1835511)). Base pack of 25 MB is far under it.

Recommendation: keep the bundled base pack at or below **30 MB**. Serve variants and stereo packs as downloadable packs (Play Asset Delivery, iOS On-Demand Resources, or an own CDN with checksum and HTTP range).

## 5. Seamless looping with ffmpeg

### 5.1 Verified tools
- `ffmpeg` 6.1.1 at `/usr/bin/ffmpeg`. Has `afade`, `amix`, `concat`, `loudnorm`, `sidechaincompress`, `anoisesrc`, `lowpass`, `highpass`, `tremolo`, `libopus`, `aac`.
- `ffmpeg-static@5.3.0` from npm installs and runs (`npm install ffmpeg-static@5.3.0`). It reports ffmpeg **7.0.2-static** with `enable-gpl` (not 6.1.1 as one search result suggested). Use it only as a build-time tool. **Never ship it in the app.**
- `apt-get install ffmpeg` on this image reports the package is already at its newest version (7:6.1.1-3ubuntu5), so no install was needed.

### 5.2 Why not `acrossfade` for this
I first tried `acrossfade` with the tail as the first input. Its output was **empty** when the tail equalled the crossfade length (`Output file is empty, nothing was encoded`). Two variants of the `acrossfade` graph failed the same way. The official docs ([ffmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), fetched) do define `acrossfade` with `d`, `c1`, `c2`, but I did not isolate the failing condition. The `afade` + `amix` + `concat` version below works.

### 5.3 Seamless loop recipe (tested)

Idea: the last `X` seconds of the source (`tail`) fade out while the first `X` seconds (`head`) fade in, and the result replaces the head. The loop length is `T - X`. The wrap seam becomes the natural continuation of the source.

```sh
#!/usr/bin/env sh
# usage: make_bed.sh in.wav out.m4a XSECONDS
# Seamless loop: tail (last X s) fades out, head (first X s) fades in, mixed with equal-power
# gains (qsin). Output length = source length - X. Loudness-normalised to -28 LUFS, mono AAC-LC 64k.
set -eu
IN=$1; OUT=$2; X=$3
T=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
N=$(awk "BEGIN{print $T-$X}")
ffmpeg -hide_banner -loglevel error -y -i "$IN" -filter_complex \
"[0:a]atrim=start=${N},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${X}:curve=qsin[tail];\
[0:a]atrim=end=${X},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${X}:curve=qsin[head];\
[tail][head]amix=inputs=2:duration=first:weights=1 1:normalize=0[xf];\
[0:a]atrim=start=${X}:end=${N},asetpts=PTS-STARTPTS[rest];\
[xf][rest]concat=n=2:v=0:a=1,loudnorm=I=-28:TP=-3:LRA=7[out]" \
-map "[out]" -ac 1 -ar 44100 -c:a aac -b:a 64k -movflags +faststart "$OUT"
```

Test result: `src.wav` (40 s pink-noise test source) with `X=2` gives a **38.00 s** file. Integrated loudness **-28.0 LUFS**, LRA 2.4 LU. Output file 313 397 bytes, 65.98 kbps.

Seam check (single-seam indicator, not a listening test): at the wrap, `|x[0] - x[-1]|` was **0.77x** the median sample step for the loop, versus **1.77x** for a naive cut at the same length. Smaller means a smoother seam.

### 5.4 Crossfade curves (tested)
`qsin` on both fades gives gain-squared sum `g1^2 + g2^2 = 1.000` at every sample: **equal power**, the right choice for uncorrelated noise beds. `tri` (linear) gives constant gain sum 1.0 and sags in power by about 3 dB at the midpoint. Use `qsin` for beds.

### 5.5 Other exact commands

Probe and loudness check:
```sh
ffprobe -v error -show_entries format=duration -of csv=p=0 bed.m4a
ffmpeg -hide_banner -nostats -i bed.m4a -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|LRA:" | tail -2
```

Opus alternative (Android-only use, not iOS):
```sh
ffmpeg -i in.wav -ac 1 -c:a libopus -b:a 48k out.ogg
```

Stereo wide bed:
```sh
ffmpeg -i in.wav -c:a aac -b:a 96k out_stereo.m4a
```

### 5.6 Use in the build pipeline
Yes. Put the script in `scripts/` as a Node module and call the ffmpeg binary through `child_process.execFile` with an argument array (no shell string). Resolve the binary as `process.env.FFMPEG_PATH ?? require('ffmpeg-static')`, falling back to `ffmpeg` on PATH. Keep the ffmpeg version pinned in the lockfile. Run the pipeline in CI or locally, never at runtime. Do not bundle ffmpeg in the app.

## 6. Procedural fallback (zero licence risk)

All recipes below ran successfully with ffmpeg built-ins (`anoisesrc`, `aevalsrc`, `lowpass`, `highpass`, `tremolo`, `join`). RMS values are relative test levels, not calibrated targets. **Not auditioned by ear**; a listening test is required.

| Bed | Recipe (tested, 20 s, stereo, 44.1 kHz) | RMS, channel 1 (dBFS) | Expected credibility |
|---|---|---|---|
| rain (light/heavy) | Two decorrelated pink noise sources, `join` to stereo, `highpass=f=300`, `lowpass=f=9000`, `tremolo=f=0.5:d=0.15`, `volume=-12dB` | -43.4 | Good under speech. Rain is the most convincing synthetic ambience. |
| wind | Brown noise, `lowpass=f=900`, `tremolo=f=0.15:d=0.6`, `volume=-10dB` | -36.2 | Good for open field and mountain wind. |
| ocean | Brown noise, `lowpass=f=600`, `tremolo=f=0.1:d=0.7` (LFO floor is 0.1 Hz), `volume=-10dB` | -36.9 | Decent swell. Add a second slower LFO for variety. |
| crowd murmur | Pink noise, `highpass=f=250`, `lowpass=f=1500`, `tremolo=f=3.7:d=0.4`, `volume=-12dB` | -46.2 | Fair. Works as a blur under narration. |
| space hum | Sine partials 55, 110, 165 Hz via `aevalsrc`, `lowpass=f=400`, `volume=-8dB` | -25.0 | Credible for `starship_bridge` and `spaceship_engine`. |
| fire crackle | Sparse random clicks: `aevalsrc='gt(random(0),0.997)*(2*random(1)-1)*0.9'`, `highpass=f=800`, `lowpass=f=7000`, `volume=-6dB` | -40.6 | Plausible but thin. Layer over a soft pink bed. |

Exact commands (60 s versions for the library; the test used 20 s):
```sh
# rain
ffmpeg -f lavfi -i "anoisesrc=color=pink:duration=60:sample_rate=44100:amplitude=0.25:seed=3" \
  -f lavfi -i "anoisesrc=color=pink:duration=60:sample_rate=44100:amplitude=0.25:seed=9" \
  -filter_complex "[0][1]join=inputs=2:channel_layout=stereo,highpass=f=300,lowpass=f=9000,tremolo=f=0.5:d=0.15,volume=-12dB[o]" \
  -map "[o]" -c:a pcm_s16le rain.wav
# wind
ffmpeg -f lavfi -i "anoisesrc=color=brown:duration=60:sample_rate=44100:amplitude=0.5:seed=1" \
  -af "lowpass=f=900,tremolo=f=0.15:d=0.6,volume=-10dB" -ac 2 wind.wav
# ocean
ffmpeg -f lavfi -i "anoisesrc=color=brown:duration=60:sample_rate=44100:amplitude=0.5:seed=2" \
  -af "lowpass=f=600,tremolo=f=0.1:d=0.7,volume=-10dB" -ac 2 ocean.wav
# space hum
ffmpeg -f lavfi -i "aevalsrc='0.25*sin(2*PI*55*t)+0.12*sin(2*PI*110*t)+0.05*sin(2*PI*165*t)':d=60:s=44100" \
  -af "lowpass=f=400,volume=-8dB" -ac 2 spacehum.wav
```

**Realistic quality**: rain, wind, ocean, crowd murmur and space hum are credible as a bed under narration, because the listener is not paying attention to them. They fail on identifiable events (horse, sword, gunfire, specific birds). Synthesis is also cheap, so the procedural set can ship as the zero-risk floor, with sampled beds layered on top once licensed.

## 7. Cue schema and prompt

### 7.1 Schema

```ts
type AmbienceCue = {
  category: AmbienceCategoryId;   // one of the 59 ids in section 2; v1 accepts beds only
  startSentence: number;          // integer >= 1, 1-based, inclusive
  endSentence: number;            // integer >= startSentence, <= sentence count of the chapter
  intensity: number;              // 0..1 -> bed gain -24 dB (0) .. -16 dB (1) relative to narration
  fadeInMs: number;               // 500..8000, default 2500
  fadeOutMs: number;              // 500..8000, default 3000
  confidence: number;             // 0..1; cues below 0.6 are dropped
  reason: string;                 // 1..140 chars; must quote or paraphrase the supporting text
};
```

Validation (zod-style): reject unknown `category`, out-of-range numbers, `endSentence < startSentence`, and sentence indices beyond the chapter. Drop the cue, keep the rest of the response, and log the count (never the text).

Future (v1.1): `kind?: "bed" | "oneshot"`, default `"bed"`. v1 parser rejects `"oneshot"`.

### 7.2 Over-cueing rules

1. **Minimum duration**: a cue spans at least **4 sentences**. Shorter cues are dropped.
2. **Density cap**: at most **2 cues per 1,000 words** (about one per 500 words). At most **6 distinct categories** per chapter.
3. **Concurrency cap**: at most **2 overlapping cues** at any sentence index.
4. **Dialogue-only stretches**: no new cue starts inside a stretch where at least 80% of sentences are dialogue, unless the setting was established in narration within the previous 10 sentences or the text explicitly names the setting.
5. **Carry-over**: an active cue continues through dialogue until a scene change or its `endSentence`.
6. **Mood cues** (`tense_heartbeat`, `ominous_drone`, `spirit_whispers`, etc.) need explicit textual evidence, and the `reason` must cite it.
7. **Merge**: two cues with the same category separated by 2 sentences or fewer merge into one.
8. **Confidence floor**: drop cues with `confidence < 0.6`. Default `intensity` 0.5 if the model omits it.
9. **No music**: never cue music. If the text describes music playing, do not cue it. `ballroom_party` is murmur and glasses only.
10. **Explicit silence**: a scene that is explicitly silent, such as "the room was silent", gets no cue.

### 7.3 Prompt draft

Use this as a system prompt for the cue-extraction call. Sentences are numbered in the user message. Substitute the id list from section 2 at build time.

```text
You are the ambience director for an audiobook. You read one chapter and choose background
soundscapes that help the listener picture the scene. Ambience sits well under the narrator,
so pick sparingly and only where the text supports it.

Input: a chapter as numbered sentences, [1] to [N].

Output: JSON only, matching this shape, no prose outside the JSON:
{"cues": [{"category": "<id>", "startSentence": <int>, "endSentence": <int>,
  "intensity": <0..1>, "fadeInMs": <int>, "fadeOutMs": <int>,
  "confidence": <0..1>, "reason": "<short reason quoting or paraphrasing the text>"}]}

Available categories (use the id exactly):
{{CATEGORY_LIST}}   <- inserted from docs/research section 2, one "id: description" per line

Rules:
- Only choose a category when the setting or event is explicit or strongly implied by the text.
- Prefer one bed per scene. Use at most two at once, and only if the scene truly has two sources.
- A cue must span at least 4 sentences. Merge cues of the same category separated by 2 or fewer sentences.
- Do not cue dialogue-only stretches unless the setting is named in narration nearby or in the dialogue itself.
- Never cue music. Never cue a sound the text does not mention.
- At most 2 cues per 1,000 words and at most 6 distinct categories per chapter.
- intensity: 0.3 for background presence, 0.5 for a normal scene, 0.8 for an action or peak moment.
- fadeInMs default 2500, fadeOutMs default 3000. Use 4000 or more for a scene change.
- confidence: how sure you are the sound fits. Omit cues below 0.6.
- reason: one sentence, at most 140 characters.
- If nothing fits, return {"cues": []}.

Examples:
Text [12] "The rain hammered the tiles above the bar."  -> light_rain or heavy_rain (plus tavern_crowd if people are present)
Text [40] "Hooves thundered across the plain."           -> horse_gallop, intensity 0.7
Text [5]  "She sat in silence, reading."                -> no cue (silence is not an ambience)
```

## Decisions and assumptions

- **CC0-first policy** for the base pack. Sonniss and Pixabay only after written confirmation. CC-BY only with a credits screen.
- **Beds only in v1**, max two simultaneous. One-shots reserved in the schema, shipped in v1.1.
- **AAC-LC m4a** for both platforms. Opus not used for iOS.
- **Procedural set** as the zero-risk floor. Sampled beds layered on top once licensed.
- **Dialogue ducking** uses sidechain compression. ffmpeg `sidechaincompress` exists, but the runtime mix is in the player, not ffmpeg. The ffmpeg command in section 5 is for the build pipeline and tests only.
- **Mix dB values** are heuristics. The only cited anchor is the 4 dB BBC test (via a Salford/AES paper). Confirm on device.

## Evidence

Commands run (abridged output):

```
$ which ffmpeg && ffmpeg -version | head -1
/usr/bin/ffmpeg
ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers

$ apt-cache policy ffmpeg
  Installed: 7:6.1.1-3ubuntu5
  Candidate: 7:6.1.1-3ubuntu5

$ apt-get install -s ffmpeg
ffmpeg is already the newest version (7:6.1.1-3ubuntu5).

$ npm view ffmpeg-static version
5.3.0

$ npm install ffmpeg-static@5.3.0   (in a scratch directory)
added 20 packages in 3s
$ node -e "require('child_process').execFileSync(require('ffmpeg-static'),['-version'])"  -> ok: runs
ffmpeg-static binary: ffmpeg version 7.0.2-static (enable-gpl, enable-libopus)

$ ffmpeg -hide_banner -h filter=acrossfade   -> c1/c2 curve options, default tri
$ afade qsin equal-power check -> g1^2+g2^2 min=1.0000 max=1.0000
$ make_bed.sh src.wav bed_final.m4a 2
Duration: 38.000000
ebur128: I: -28.0 LUFS, LRA: 2.4 LU
bed_final.m4a: 313397 bytes, 65.98 kbps
seam: loop 0.77x median step vs naive 1.77x

$ procedural recipes: wind ok, ocean ok (after LFO fix), fire ok (after gt() fix), crowd ok, space hum ok, rain ok
$ ducking test (sidechaincompress, ratio 8, attack 20, release 400): mix ok
$ AAC mono 64k / stereo 96k / Opus mono 48k (ogg): all encode ok
```

Failures seen and fixed during testing:
- `acrossfade` empty output when tail equals crossfade length. Replaced by `afade` + `amix` + `concat`.
- `tremolo` minimum frequency is 0.1 Hz (0.08 rejected). Fixed.
- ffmpeg expression parser: `>` not accepted in `aevalsrc`. Use `gt()`.

Test files are in the session scratchpad only. Nothing was committed.

## Open issues for the architect

1. **Licence confirmations needed before the base pack**: (a) Sonniss, embedding processed loops in a commercial app; (b) Pixabay, same; (c) BigSoundBank, read the full licence page; (d) Kenney, confirm each audio pack's licence file. Owner: user or legal.
2. **Gapless AAC on device**: test a 38 s loop for audible gaps in AVPlayer and ExoPlayer. If it fails, fall back to CAF/PCM loops or pad the head.
3. **Listening test** for procedural beds and mix levels (-22 dB default, ducking 6 to 9 dB). Constants live in one config file.
4. **Narration loudness target**: align the bed reference with the TTS normalisation chosen in R5 (not in this brief).
5. **Store limits**: confirm current Play Asset Delivery and iOS On-Demand Resources limits. My sources conflict (2019 for iOS; mixed for Play).
6. **ffmpeg-static is GPL**: it is build-time only. Make sure it is never bundled in the shipped app.
7. **Repo docs**: `docs/CONVENTIONS.md` and `docs/STATE.md` do not exist in this repo, so this report did not read them. The brief did not require them. The agent instructions mention them; the architect should decide whether to create them.
8. **Unresolved source detail**: the BigSoundBank "Horn #3" page reads like template text. Treat its licence claims as unverified until the licence page is read.

## Sources

Fetched (primary):
- Freesound FAQ: https://freesound.org/help/faq/
- Sonniss GDC bundle page: https://sonniss.com/gameaudiogdc/
- Sonniss GDC licence text (partial): https://sonniss.com/gdc-bundle-license/
- Pixabay Content License Summary: https://pixabay.com/service/license-summary/
- Pixabay FAQ: https://pixabay.com/service/faq/
- Kenney support: https://www.kenney.nl/support
- BigSoundBank: https://bigsoundbank.com/
- CC0 1.0 deed: https://creativecommons.org/publicdomain/zero/1.0/
- Android media formats: https://developer.android.com/guide/topics/media/media-formats
- ffmpeg filters documentation: https://ffmpeg.org/ffmpeg-filters.html

Search results and secondary (used with caution):
- Apple AVFileType (page body empty): https://developer.apple.com/documentation/avfoundation/avfiletype
- Apple developer forum, Opus in CAF: https://developer.apple.com/forums/thread/722399
- ogg_caf_converter (iOS and Ogg claim, secondary): https://pub.dev/documentation/ogg_caf_converter/latest/
- OpenGameArt Loopable Dungeon Ambience (CC0): https://opengameart.org/content/loopable-dungeon-ambience
- OpenGameArt 50 RPG sound effects (Kenney, CC0): https://opengameart.org/content/50-rpg-sound-effects
- Defold Kenney listing: https://defold.com/assets/kenney
- Salford repository, BBC 4 dB test and loudness-range figures (Torcoli et al., AES 2019): https://salford-repository.worktribe.com/OutputFile/1488623
- ACX standards summary (forum, secondary): https://forum.audacityteam.org/t/audible-com-qc-standards/29508
- Ambience loop tool: https://elysiatools.com/ai/en/tools/audio-seamless-ambience-loop.md
- Loop maker: https://violetrecording.com/tools/loop-maker/
- Google Play app limits: https://support.google.com/googleplay/android-developer/answer/9859372
- TechCrunch, iOS 200 MB cellular cap (2019): https://techcrunch.com/?p=1835511
- ffmpeg-static on socket.dev (version listing): https://socket.dev/npm/package/ffmpeg-static/overview/5.3.0
