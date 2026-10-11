# src/audio

Playback engine, ambience mixer and media session (lock-screen controls).

**Import rules**

- May import from `src/core` and `src/services`. UI code comes in through `src/features`, never the other way round.
- Native audio modules are only used here, behind a small interface that tests can mock.
