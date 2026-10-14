# Brief F1: Player and audio fixes from the AAA audit

**Type**: implementation. Read `CLAUDE.md`, `docs/CONVENTIONS.md` (React Compiler + Worklets rules), `docs/STATE.md`, **`docs/qa/2026-10-13-QA-B-player-audio.md`** (the source of every item below; each has file:line), plus the QA-C items cited. Probes that reproduce several bugs are in the scratchpad: `/tmp/claude-0/-home-user-App-idea/005bdf22-f3a2-59c7-918d-ae1c7220d1ea/scratchpad/qa-b/repo/src/qa-b/`. Port them into real regression tests.

## Architect decisions
- **Beds follow the transport.** They fade out (~600 ms) about **350 ms** after the voice leaves `playing`/`buffering`: paused, ended, error, or an unavailable chapter. The debounce avoids flicker at segment swaps. They fade back in on play. The sleep-timer fade also fades the beds. Ducking applies only while the voice is `playing`; it never makes beds louder on pause.
- **Saved settings are the source of truth.** Ambience enabled, level and ducking come from settings on load and on every change. The in-player sheet writes back to settings. Use **one range constant** in core for the level: **−40…0 dB**, the slider's visible range in both places, with the schema clamped to it. Ducking 0–24 dB comes from settings (the default stays 7).
- **Keep `doNotMix`** (lock-screen controls depend on it). Document the trade-off in ADR-0002's amendment section; no code change.

## Scope (QA-B ids)
1. **P1-1**: the auto-advance bounce in `app/player.tsx`. React only to changes of the route param.
2. **P1-2**: beds follow the transport, as decided above.
3. **P1-3**: settings drive ambience; one level range.
4. **P1-4**: an engine error during playback shows the error state with "Try again", which resumes at the saved sentence. Add error injection to the fake engine.
5. **P1-5**: `final` is set only from a terminal outcome (`ready`/`failed`). `idle`/`cancelled` keep the chapter not final, and the end of the available audio shows a calm "Narration paused. More audio will appear when processing continues." state. Re-subscribe when processing resumes. N3 is adding stall and reconnect states in `src/services/pipeline/*`: treat any non-terminal state as narrating, without editing N3's files.
6. **P1-6**: one preview player owned by the playback layer. A preview pauses the narration, stops any other preview, and resumes the narration afterwards if it was playing. The device-voice sample does the same.
7. **P2-1** (defer the auto-advance), **P2-2** (load sequence number), **P2-3** (dispose during load), **P2-4** (a pending seek before the first load).
8. **P2-8**: create the ambience context on the first bed start, `suspend()` ~2 s after the last bed stops or on pause, and `resume()` on play.
9. **P2-9**: size the decoded-bed cache by bytes (budget 48 MB), not by count.
10. **P2-10/P2-11**: isolate the 4 Hz position subscribers (scrubber labels and clock in small children), memoise the synced text pane with stable callbacks, draw scrubber ticks once per timeline, `useMemo` the mini-player gesture, and make the mini-player play button a sibling (QA-C P1-6).
11. **P2-12**: synced-text follow falls back to `scrollToOffset` plus a retry when `scrollToIndex` fails.
12. **P2-14**: repeat-sentence schedules its seek from the predicted end (rate-aware), with the position event kept as a backstop.
13. **P2-17**: failure copy specific to the cause; never blame the connection for a local error.
14. **P2-18 / QA-C P1-5 (player part)**: `accessibilityActions` for previous and next sentence on the transport, and for sentence spans (repeat, copy, save to Vocab).
15. **P3**: persist the playback speed (global setting); a sleep ticker that sleeps until the fade starts; evict the preview cache (keep the last 20); delete or document the dead interruption path.

## Out of scope
- P2-5/P2-6/J1 (native media session, gapless): a separate proposal.
- P2-13/J2 (real sentence timing): a separate proposal.
- P2-15 (per-chapter resume): needs a migration; it goes in the data wave after N3.

## Tests
Regression tests for every P1 and P2 item. Mutation-check P1-1, P1-2, P1-3 and P1-5.

## Constraints
- Don't touch `src/services/**`, `src/core/pipeline/**`, `src/features/pipeline/**`, `src/features/library/**`, `src/features/series/**`, `src/features/chapter/**`, `src/features/diagnostics/**` (N3), or `scripts/sounds/**`, `assets/**`, `src/core/analysis/**`, `src/core/playback/resolve-bed.ts`, `src/audio/ambience-pack.ts` (A4).
- If a fix needs one of those files, stop and report it.
- No `npm install`, no commits.

## Acceptance
`npm run verify` is green (paste the tail; if it fails only in N3/A4 areas, show your areas pass with targeted runs plus typecheck and lint). Include a list of S1 device checks.
