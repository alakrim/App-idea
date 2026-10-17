# ADR-0008: Progressive narration: listen while the chapter is still being made

**Status**: accepted (2026-10-17)

## Context
Long chapters (40+ minutes of audio) take a long time before the user can press play.
- The stages run strictly in order: extract → segment → analyze (whole chapter) → translate (whole chapter) → narrate.
- Narration then synthesizes segments in **lock-step pairs**: each pair waits for its slower half, and only two requests are in flight.
- The player can already append segments while a chapter is narrating, but nothing reaches it until analysis and translation of the whole chapter are done.

The user suggested splitting long chapters into three parts. The segment-based design already stores audio in small playable files, so we go further: a **streaming pipeline with a short time-to-first-audio**.

## Decision
1. **Time to first audio is the metric.** The target is under 20 s from tapping "Add" to the first sentence playing, for a URL chapter in a language that needs no translation (measured on device with Gemini Flash Lite).
2. **Analysis leaves the critical path.** Ambience cues and chapter memory are not needed to start listening. Analysis runs **concurrently** with translate and narrate. Cues land in the DB when ready, and the player picks them up live.
3. **Translate and narrate stream.** Translation works in chunks in reading order and persists each chunk. Narration consumes translated sentences as soon as they exist, rather than waiting for the whole chapter.
4. **Adaptive TTS pool.** This replaces the lock-step pairs:
   - a sliding window, starting at 4 requests in flight, AIMD (+1 after 4 straight successes up to 8, halve on 429 or overload)
   - segments are saved and announced strictly in order, so the player always has a contiguous prefix
5. **Ramped segment sizes.** The first segment is short, about 12 s of estimated speech (one or two sentences), so the first audio arrives in seconds. The second is about 25 s. Then the narrator's normal size applies. The ramp is measured in speech seconds, not characters, so Chinese and Japanese ramp as quickly as Latin scripts (brief F2).
6. **Player UX.**
   - "Listen now" becomes available as soon as the first segment exists.
   - The scrubber shows the generated portion as a buffer band.
   - If playback catches up with generation, the player shows a calm "Narrating ahead…" state (ambience keeps playing) and resumes on its own.
   - The chapter screen shows a live ETA.

## Consequences
- The run model changes from "one stage at a time" to "extract → segment, then three concurrent workers". Job records keep one row per stage, so progress and resume semantics remain.
- Cost is unchanged: the same text is synthesized once.
- Trade-off: the opening window (about 90 s of speech) is translated with a glossary from earlier chapters only, so a name first met in this chapter may be rendered differently there. The segment that closes the window also waits for the first chunk after it, which waits for analysis, so the window's last segment can start later than the first one.
