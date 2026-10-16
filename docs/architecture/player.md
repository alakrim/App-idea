# Architecture: Player and learning features

> Part of `docs/ARCHITECTURE.md` (system overview and sentence spine live there). ADRs in `docs/decisions/` win over this file.

## 6. Player and learning features
- Background playback, lock-screen and Bluetooth controls, cover art = series cover **[R2]**.
- Speed 0.5–2× with pitch preserved, a sleep timer (including "end of chapter") and auto-advance to the next chapter.
- Synced text view with the current sentence highlighted and auto-scroll. Tap a sentence to seek.
- **Learner mode**: a bilingual view (original under translation), repeat-sentence / A-B loop, and long-press a word or phrase to save it to **Vocab** with an in-context LLM explanation.

