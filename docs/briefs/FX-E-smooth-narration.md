# Brief FX-E: Smooth narration (fix wave for QA-E)

**Type**: fix wave. **Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md` (React Compiler and Worklets rules), `docs/qa/2026-10-17-QA-E-audio-player-background.md` (the audit: findings, proofs, expo-audio native references), `src/audio/**`, `src/features/player/{playback-controller,player-provider,player-engine,player-store}.ts*`, and the expo-audio 57 sources in `node_modules/expo-audio` (`AudioModule.kt`, `AudioControlsService.kt`, `AudioPlayer.kt`) for the exact lock-screen and focus behaviour.

## Why
The user reports, for the third time, that narration "stops and starts like a broken CD". Incident 3 (two focus clients) is fixed and guarded. The audit found the next likely causes at **every segment boundary**:
- **E-01**: the lock-screen media session is torn down and rebuilt.
- **E-06**: the gap is a JS round trip.
- **E-07**: focus is abandoned and re-requested.

On top of those, three player-state bugs (E-02, E-03, E-04) and a ducking flap (E-05).

## Scope (in order)
1. **Measure first: playback health in Diagnostics.**
   - Record, in the engine (pure, injectable clock):
     - each boundary gap: from the outgoing `didJustFinish` (or the pre-roll trigger) to the incoming player's first `playing: true` with position advancing
     - buffering toggles per minute
     - run-dry events
     - focus-loss pauses
   - Keep a rolling summary (p50/p95/max gap, counts) in a small store.
   - Show it in Diagnostics as a **"Playback health"** card, and include it in **Copy report**.
   - This is how the device test returns real numbers. Tests cover the math.
2. **E-01, keep the lock screen alive across boundaries.**
   - The incoming player takes over the lock-screen registration **before** the outgoing one is released. Never leave a moment with no active lock-screen player while the chapter plays.
   - Flip on the proof `voice-player.audit.test.ts` "a boundary does not unregister the finished player from the lock screen". Move it into the regular suite once it passes.
3. **E-06 + E-07, gapless-enough boundaries.**
   - Preload the next segment's player and require its `isLoaded` before relying on it.
   - **Pre-roll**: start the incoming player when the outgoing one has about 80 ms left. Use the status position and duration; status updates come at the poll rate, so arm a JS timer from the last status with the remaining time.
     - Then stop the outgoing one right after the incoming one reports playing.
     - Because a player is always playing, expo-audio never abandons focus at the boundary (E-07).
     - Guard against double-starts and overlap clicks. A ≤ 80 ms overlap of speech tails is acceptable: TTS segments end in silence. Measure the gain with item 1's metric in a fake-timer test.
   - If pre-roll is impossible for a format, fall back to start-on-finish, but with the incoming player already loaded.
   - Document the remaining device risk. A true single-file or gapless player (J1) is a later option, not this brief.
4. **E-02**: after running dry, resume only when there is a lead of at least **10 s** of contiguous audio past the position, or the chapter is final (`RESUME_LEAD_MS = 10_000`). Flip on the proof.
5. **E-03**: track the listener's intent (`userPaused`). A `playing` status that arrives while the user paused is paused again, and focus regain never resumes a user-paused session. Flip on the proof. A transient interruption that the **system** caused still resumes, as now.
6. **E-04**: a generation token per load/seek. Finish and status events from a superseded player are ignored. Flip on the proof.
7. **E-05**: hysteresis for ducking. A buffering flap shorter than 1.5 s keeps the beds ducked. Flip on the proof.
8. **E-11**: re-apply `setPlaybackRate` only when the rate changes, or on a newly loaded player where it isn't already set.
9. **E-12**: make `PlayerEngineProvider` StrictMode-safe: create the controller in a ref or lazily, and don't dispose and leave a disposed engine on a double mount. Add a test.

Out of scope, and noted in your report:
- **E-08**: focus mode doNotMix vs ducking. This is a product decision; the architect will ask the user.
- **E-09**: lock-screen next/prev and headset commands; expo-audio 57 does not expose them.
- **E-10**: player re-renders; that belongs to QA-G.

## Verification
- All 5 proofs pass and move from `*.audit.test.ts` into the regular suite, so `focus-clients` stays a guard. Mutation-check each fix: revert the fix and confirm its test fails.
- `npm run verify` is green. `npm run boot:check` passes.
- In your report, write a device checklist for the user that names the Diagnostics "Playback health" numbers to send back.

## Constraints
- No new dependencies. Don't touch `src/core/pipeline/**`, `src/services/**` or `src/db/**`, except the Diagnostics card wiring in `src/features/diagnostics/**`.
- Work in your worktree. If `node_modules` is missing, `ln -s /home/user/App-idea/node_modules node_modules`.
- Commit with your harness Co-Authored-By trailer plus `Claude-Session: https://claude.ai/code/session_016sqBEw3paK5QXmP6QkprQ9`. Do not push.
- Context budget: at about 220k tokens (about 150 tool calls), stop at a committed checkpoint, write `docs/briefs/FX-E-handoff.md`, and report.
