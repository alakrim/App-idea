# Architecture: Ambience

> Part of `docs/ARCHITECTURE.md` (system overview and sentence spine live there). ADRs in `docs/decisions/` win over this file.

## 5. Ambience
- There is a fixed taxonomy of categories **[R4]**. The LLM picks only from that enum, so it cannot invent sounds we don't have.
- A cue is `{category, startSentence, endSentence, intensity, fadeInMs, fadeOutMs, confidence}`. A validator enforces minimum length, a cap on cues per 1k words, no overlaps beyond 2 beds, and drops low-confidence cues.
- The mixer plays at most 2 beds, ducked under the voice (about −20 dB, tunable **[R4]**), with crossfades. Cues fire on sentence-boundary events from the player.
- Sound packs: a bundled base pack plus downloadable packs, with a license manifest per file **[R4]**.
- Users can toggle cues per chapter, and set ambience volume or turn ambience off globally.

