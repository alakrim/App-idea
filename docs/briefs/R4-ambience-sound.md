# Brief R4: Ambience sound library and cue design research

**Type**: research. No code. Today is 2026-10-11.

## Context
Lectio narrates text and plays **low background ambience** under the voice when the scene calls for it: horse riding (hooves and tack), a sword battle, a gunfight, rain, a storm, a tavern crowd, forest birds, ocean waves, a crackling fire, a city street, a spaceship hum, and so on. An LLM reads each chapter and emits cues anchored to sentence ranges. The player fades each bed in and out under the voice.

## Questions
1. **Sources of redistributable audio.** We must be able to **bundle or download these files inside a commercial app**. Find concrete sources with clear licenses: CC0 (Freesound CC0 filter, BigSoundBank, Sonniss GDC bundles and their license terms, Pixabay sound effects license, OpenGameArt CC0, Kenney...). For each source give the license summary, attribution requirements and whether redistribution inside an app binary or CDN is allowed. Flag anything risky.
2. **Taxonomy.** Propose a taxonomy of ~40–60 ambience categories that covers fiction (fantasy, xianxia/wuxia cultivation novels, sci-fi, thriller, romance, horror) and non-fiction. Group them into families (nature, weather, urban, combat, transport, interiors, mystical, sci-fi). Give each category a stable `snake_case` id, a description for the LLM prompt, and whether it is a *bed* (loop) or a *one-shot* (thunder clap, door slam, sword clash accent). Recommend whether v1 should support one-shots at all.
3. **Layering.** Should cues support 2 simultaneous beds (e.g. `rain` + `tavern_interior`)? What are the recommended max concurrency, default mix levels relative to voice (in dB, e.g. a bed at −18 to −24 dB under speech), ducking amounts and fade times? Cite audio-drama or audiobook production practice where possible.
4. **File format and budget.** Choose the format for Android plus iOS (AAC/m4a vs Opus/ogg; iOS Opus support via CAF?), loop length (30–90 s seamless loops), bitrate (mono vs stereo), and the total size budget for a base pack bundled in the app vs downloadable packs.
5. **Seamless looping.** How to prepare seamless loops (crossfade the tail into the head) and how to do it with `ffmpeg` (give exact commands). Is `ffmpeg` usable in our build pipeline (a Node script in the repo)?
6. **Procedural fallback.** Could some beds (rain, wind, ocean, fire crackle, space hum, crowd murmur) be **synthesized** credibly (filtered noise plus modulation) so we have zero licensing risk for a base pack? Give the recipes (e.g. pink noise + bandpass + LFO). How good is it realistically?
7. **Cue schema.** Propose the JSON schema for an ambience cue the LLM emits: `{category, startSentence, endSentence, intensity, fadeInMs, fadeOutMs, confidence, reason}`. Include rules to avoid over-cueing (min duration, max cues per 1k words, no cue on dialogue-only stretches unless setting is explicit), and a prompt draft.

## Deliverable
Write `docs/research/R4-ambience.md` with a TL;DR, the license table, the full taxonomy table, mix guidelines, ffmpeg recipes, the procedural recipes and the cue schema/prompt. Do not modify any other repo file.
