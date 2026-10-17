# QA-E: audio, player and background (2026-10-17)

_Read-only audit under brief `docs/briefs/Q2-debug-audit.md` (QA-E). Branch `worktree-agent-a532a33a9aea3f88f`, unified code line. Proofs are `*.audit.test.ts` and are excluded from `npm test` by `testPathIgnorePatterns` in `jest.config.js`. Run them with `npx jest --testPathPattern='audit\.test' --testPathIgnorePatterns=/node_modules/`. Expo SDK 57 and expo-audio 57.0.5 sources were read from `node_modules`._

## Summary

| id | severity | title | proof |
|---|---|---|---|
| E-01 | P1 | Every segment boundary tears down and rebuilds the lock-screen media session and its foreground state | `voice-player.audit` › "a boundary does not unregister the finished player from the lock screen" (fails: 1 call, want 0) |
| E-02 | P1 | After running dry, narration restarts on the first short segment, so progressive playback stops and starts | `voice-player.audit` › "a resume after running dry waits for a usable lead instead of one 4 s segment" (fails) |
| E-03 | P1 | Focus regain resumes narration the listener had paused (phone call, navigation prompt) | `voice-player.audit` › "a playing status that arrives after the listener paused is paused again" (fails) |
| E-04 | P2 | A finish from the file a seek just replaced can end the chapter (and a stale `loaded` can consume a pending seek) | `voice-player.audit` › "a finish reported for the file being replaced by a seek does not skip the chapter" (fails) |
| E-05 | P2 | Each buffering flap releases the ducking, so the beds swell 7 dB for 550 ms and dip again | `lectio-engine.audit` › "a buffering flap during playback does not release the ducking of the beds" (fails) |
| E-06 | P2 | The segment boundary gap is a JS round trip (`didJustFinish` → `play()`), and the incoming segment is played without a loaded check. Size unmeasured | device (S1), no Jest proof possible |
| E-07 | P2 | expo-audio abandons and re-requests audio focus at every boundary, so another app can resume in the gap | source-proven (AudioModule.kt), effect on device |
| E-08 | P2 | `interruptionMode: 'doNotMix'` pauses narration for every transient focus request (QA-B P2-7, still open) | source-proven, needs a product decision |
| E-09 | P2 | No lock-screen next, previous, seek or headset commands reach the engine (QA-B P2-6, still open) | source-proven (`noRemoteEvents`) |
| E-10 | P2 | Whole-player re-render at about 4 Hz from `store.setState` on every position update (QA-B P2-10, still open; not re-audited here) | carried over |
| E-11 | P3 | `setPlaybackRate` is re-applied on every slot load, so every boundary may reconfigure the audio sink | hypothesis |
| E-12 | P3 | Dev-only: `PlayerEngineProvider` disposes the controller on every effect cleanup, so a double mount leaves a disposed engine | source-read, dev builds only |
| E-13 | P3 | `ProcessingService` and expo-audio's media service are two foreground services with separate notification IDs (4271 vs media3's); no collision found | checked, no finding (listed for the S1 log) |

**P1 count: 3** (E-01, E-02, E-03). Proof tests: the three P1 names above, plus the P2 proofs E-04 and E-05. The incident-3 guard passes (see below).

## Incident 3: one audio-focus client (proven)

The brief asks to prove the choppy-narration fix cannot recur. Findings:

- **react-native-audio-api requests focus in exactly one place.** `AudioAPIModule.observeAudioInterruptions` (`node_modules/react-native-audio-api/android/src/main/java/com/swmansion/audioapi/AudioAPIModule.kt` lines 135–148) calls `MediaSessionManager.requestAudioFocus`. `setAudioSessionActivity` is a no-op on Android (line 114). No C++ or JS path calls either, and `src/` never calls `observeAudioInterruptions` (the only references are in `native-engine.ts` comments and its test mock).
- **expo-audio is the only live focus client.** `requestAudioFocus` lives in `expo/modules/audio/AudioModule.kt` (lines 143–183), with `GAIN_TRANSIENT` for `doNotMix`.
- **The beds' AudioContext is created once**, in `src/audio/native-engine.ts:66`. No other `new AudioContext(` exists in `src`, `app` or `modules`.
- **Guard test (passes):** `src/audio/focus-clients.audit.test.ts`. It fails if any source file calls `observeAudioInterruptions(`, `requestAudioFocus(` or `setAudioSessionActivity(true`, or creates a second AudioContext. It skips test files, and it is a guard, not a proof, so it is excluded from `npm test` with the others.

Conclusion: incident 3 cannot recur through the code paths in this repo. The guard catches a future regression at review time. The residual focus behaviour is E-07 and E-08.

## P1 detail

### E-01: a boundary tears down the lock-screen session
- **Reproduction:** any chapter that plays across a segment boundary. Paid narrators cut at about 40 s, so a one-hour chapter has about 90 boundaries.
- **Evidence:** `src/audio/voice-player.ts:131-138` (`activate`): before `setActiveForLockScreen(true)` on the incoming player, it calls `clearLockScreenControls()` on every other slot, including the one that just finished.
- **Native effect (expo-audio 57.0.5):** `AudioPlayer.clearLockScreenControls` → `AudioControlsService.unregisterPlayer()` → `clearSessionInternal()`, which calls `mediaSession.release()` and `stopForeground(STOP_FOREGROUND_REMOVE)` (`service/AudioControlsService.kt` lines 413–423, 481–483). Then `setActiveForLockScreen(true)` on the incoming player goes through `setPlayerOptions` → `setActivePlayerInternal`, which calls `hideNotification()`, builds a new MediaSession and calls `startForeground` again (lines 281–310, 338–396).
- **Second source:** `loadSlot(finished, null)` also calls `clearLockScreenControls()` when the incoming segment is the last one available (`voice-player.ts:93-99` and `:163`).
- **Root cause:** the platform allows the new player to take over the session with `setActiveForLockScreen(true)` alone. The explicit clear makes the service drop foreground status and notification at every swap.
- **Proposed fix (S):** activate the incoming player first and do not clear the outgoing one. Clear only when the chapter is released or the last segment has finished. Keep the proof, which asserts zero clears per boundary.
- **Audible effect:** unmeasured. The lock-screen notification is removed and re-posted at every boundary, which is certain. Whether ExoPlayer audio stalls with it is for S1.

### E-02: progressive playback restarts on each short segment
- **Reproduction:** open a chapter that is still narrating, and narration is slower than playback. Play runs dry, `advance()` sets `ended` and the engine goes to `buffering`. The next `append()` of a 4–12 s segment calls `advance()` at once, and `play()` runs because `wantPlaying` stayed true. The voice runs dry again within seconds. That is the stop-start loop.
- **Evidence:** `voice-player.ts:141-166` (`advance`, `if (wantPlaying) incoming.player.play()`), `voice-player.ts:237-250` (`append` resumes when `ended`), `playback-controller.ts:420-426` (`appendFromData` appends every segment as it arrives, with no lead check).
- **Condition to confirm on device:** the Diagnostics "Recent chapters" block (stage durations and audio seconds) shows generation slower than real time for that chapter.
- **Proposed fix (M):** after running dry on a non-final chapter, hold the restart until about 10 s of unplayed audio is buffered (proposed `RESUME_LEAD_MS`), or until the narration is final. Report the hold as `buffering`. Keep the proof.

### E-03: focus regain resumes narration the listener paused
- **Reproduction:** narration is playing and a phone call (or a navigation prompt) arrives. expo-audio pauses the player, sets `isPaused = true` (`AudioModule.kt` lines 84–95) and the engine shows paused. The listener taps pause during the call. Expo's `pause()` does not clear `isPaused`. When the call ends, focus gain runs `if (playable.isPaused) play()` (lines 121–127), and the narration starts again without anyone asking.
- **Evidence:** the only places that clear `isPaused` are the focus gain handler and the foreground handler (lines 125–126, 316–317). Our `voice-player.ts` `pause()` does not guard against this.
- **Proposed fix (S):** in `onStatus`, when the voice has been paused by the listener (`wantPlaying === false`) and the status reports `playing: true`, call `pause()` again and keep the listener's state. Keep the proof. Also file an upstream note on expo-audio: `pause()` should clear `isPaused`.

## P2 detail

### E-04: a stale finish or loaded status after a seek
- **Reproduction:** the listener seeks within about 250 ms of a segment's end. `seekTo` calls `replace` on the active slot and sets `holds` to the new index. A `didJustFinish` from the old file, already in the queue, is accepted because `onStatus` checks only the slot, not the file. `advance()` then reports `ended` (last segment) or moves on.
- **Evidence:** `voice-player.ts:168-192` (no generation check), `voice-player.ts:263-285` (`seekTo`). The same gap lets an old `isLoaded: true` consume `pendingSeekMs` before the new file is ready (`onStatus` lines 173–178).
- **Proposed fix (S-M):** a per-load generation carried through `loadSlot`. Ignore `didJustFinish` and `isLoaded` for a slot until a status arrives for its new file, for example by checking `currentTime` against the seek offset.

### E-05: buffering flaps pump the beds
- **Reproduction:** ExoPlayer reports `isBuffering` for a moment while the voice still plays. `deriveState` returns `buffering`, `updateDucking` sees `engaged = state === 'playing' || duckHeld` as false, and the mixer ramps the ducking out over `releaseMs: 550` (`src/core/playback/ducking.ts:2`, `lectio-engine.ts:146-158`). Then the next `playing` snapshot dips it again.
- **Evidence:** the proof shows the release call (`gainDb 0`, `rampMs 550`) on the buffering snapshot.
- **Condition:** frequency of `isBuffering` flaps. Count them on device.
- **Proposed fix (S):** count `playing && buffering` as voice-active for ducking, and keep beds ducked. Only a pause, an end or an error releases them.

### E-06: the boundary gap
- **Path:** `advance()` runs only after the outgoing player's `didJustFinish` reaches JS, and then calls `incoming.player.play()`. The gap is one event hop plus the native start, and it happens at every boundary. `advance()` also does not check `incoming.loaded`, and `loaded` for the preloaded slot is never updated, because `onStatus` ignores non-active slots (`voice-player.ts:168-170`). A late preload therefore plays into a not-ready player.
- **Why it matters:** this is the most likely cause of the "broken CD" feel, and it cannot be proven in Jest because the gap lives in native timing.
- **Next step:** S1 measures it (see device list). If the gap is audible, the fix is J1 (one gapless player or an expo-audio playlist with a native media session) or a pre-scheduled start. Promote E-06 to P1 if the measured gap is above about 50 ms.

### E-07: audio focus is dropped and re-requested at every boundary
- **Evidence:** `AudioModule.kt` `onPlaybackStateChange` calls `releaseAudioFocus()` when no player plays (lines 366–368 and 688–690), and `requestAudioFocus()` on the next play (lines 476–501 and 796–797). The swap stops the old player before the new one plays, so focus is dropped and re-taken at every boundary. Another app that has paused can resume in that gap, which the incident-3 write-up noted.
- **Fix:** the same as E-06 (a single player removes the gap). Document the trade-off in the S1 log.

### E-08: doNotMix pauses for every other app
- **Evidence:** `voice-player.ts:220` `interruptionMode: 'doNotMix'`. Any transient focus request pauses narration, including navigation prompts, because expo-audio's ducking branch is never reached for this mode. This is QA-B P2-7, still open.
- **Decision needed:** lock-screen and voice continuity against ducking under navigation prompts. The product owner decides.

### E-09: no remote commands
- **Evidence:** `native-engine.ts:31-35` (`noRemoteEvents`). Lock-screen next and previous, seek, and headset and Bluetooth buttons never reach the engine (QA-B P2-6, still open). The engine's `handleRemote` is tested, but nothing feeds it.

### E-10: re-render rate (carried over)
- QA-B P2-10 still applies: every `onPosition` (about 4 Hz) calls `store.setState` (`player-store.ts:145-147`), and all subscribers re-render. Not re-audited in this pass. QA-G owns the UI side.

## P3 detail

- **E-11:** `voice-player.ts:104` and `:289` apply `setPlaybackRate(rate, 'high')` on every slot load and on every boundary. Whether ExoPlayer reconfigures the audio sink at each call is unknown. Measure a click at 1.5× and 2× on device.
- **E-12:** `player-provider.tsx:61` `useEffect(() => () => controller.dispose(), [controller])` disposes the controller on the first effect cleanup. Under StrictMode's double mount, the controller and its engine are disposed while still in use. Check whether the dev build enables StrictMode. Production is not affected.
- **E-13:** checked, no collision. `ProcessingNotifications.NOTIFICATION_ID` is 4271, and expo-audio's recording notification is 2001. Media3 uses its own ID. Recorded for the S1 log.

## Re-check of 2026-10-13 QA-B findings (player, audio)

| QA-B id | Status now | Where |
|---|---|---|
| P1-1 route re-plays chapter after auto-advance | fixed | `app/player.tsx:32-46` (`handledRef` per request) |
| P1-2 ambience ignores transport | fixed | `lectio-engine.ts` `bedsWanted`, `BED_STOP_DELAY_MS`, `BED_FADE_OUT_MS`. Ducking part: E-05 |
| P1-3 saved ambience settings never reach playback | fixed | `playback-controller.ts` `applyAmbience`, `setAmbience` writes back, shared ranges |
| P1-4 engine error is silent | fixed | `playback-controller.ts:275-281` (`failure: 'playback'`) |
| P1-5 processing stop reads as complete | fixed | `isNarrationComplete` (`ready`/`failed` only) |
| P1-6 settings previews over narration | partly | `previewBed` layers beds on narration; `playSample` pauses it. Overlapping narrator previews not re-verified |
| P2-1 re-entrant ended fan-out | fixed | `playback-controller.ts:286` (deferred with `Promise.resolve`) |
| P2-2 superseded load moves position | fixed | `lectio-engine.ts` `loadSeq`; `voice-player.ts` `loadToken` |
| P2-3 dispose during load leaks players | fixed | `voice-player.test.ts` (dispose before the load settles) |
| P2-4 seek before first load overwritten | fixed | `voice-player.ts` `requestedStartMs`; test in `voice-player.test.ts` |
| P2-5 segment swap churn | still open, now E-01, E-06, E-07 | |
| P2-6 lock screen has no skip | still open, E-09 | |
| P2-7 doNotMix | still open, E-08 | |
| P2-8 ambience context never suspended | fixed | `BED_SUSPEND_DELAY_MS` and `suspend()` in the mixer |
| P2-9 memory for decoded beds | partly | byte-bounded LRU (48 MB), still about 4 beds of 60 s |
| P2-10 re-renders at 4 Hz | still open, E-10 | |
| P2-14 repeat overshoot | fixed in code | `enforceRepeat` schedules from the predicted end |
| P2-15 resume per series, not per chapter | fixed | `resumeSentence` (`chapterPosition`) |
| P2-16 scrubber total grows | fixed | `estimatedTotalMs` |

## Verified OK (read end to end)

- **Phone call and transient loss, resume on gain:** expo-audio pauses on `LOSS_TRANSIENT` and resumes on `GAIN` only when `isPaused` is set (intended). Permanent `LOSS` pauses without auto-resume. Our engine follows the snapshots. The defect is E-03 only.
- **Sleep fade and volume:** `setVolume` drives the voice and the master gain. expo's `Playable.previousVolume` tracks the set value, so a focus-gain restore does not reset the fade.
- **`setCues` and `reloadCues` do not touch the voice** (`lectio-engine.ts:370-374`, `playback-controller.ts:412-418`). They only re-plan beds, through diffed commands.
- **Load races:** a load during the audio-mode await creates no players (`voice-player.ts:224-225`), and a dispose during load creates none either.
- **Wake and Wi-Fi locks:** acquired in `acquireLocks`, released in `shutDown`, `onDestroy` and the time-out path (`ProcessingService.kt:46-50, 70-75, 95-100`). The wake lock has a 6 h limit. No leak found.
- **Background starts:** a start refused from the background returns `false` and processing continues (`ProcessingService.kt:131-143`). The Android 15 time-out stops the service and keeps the queue (`onTimeout`).
- **Position saves:** flushed on pause, end, error and app background (`player-provider.tsx:63-68`). The worst-case loss on a kill is 5 s, as QA-B noted.
- **Route re-play** after auto-advance (QA-B P1-1) is fixed.

## Hypotheses to check on device (no full path yet)

1. **Boundary gap size (E-06, S1):** log `didJustFinish` to the `play()` call and the audio output start, over 10 min across about 15 boundaries, on a paid narrator (40 s) and on the free one (120 s).
2. **Lock-screen flicker at each boundary (E-01):** watch the notification shade and the lock screen while a chapter crosses 5 boundaries.
3. **Other app resumes at each boundary (E-07):** with a music app paused in the background, does it resume during a swap?
4. **Buffering flap count (E-05):** count `isBuffering` toggles per minute, on a fresh chapter and on a fully narrated one.
5. **Sentence drift at boundaries:** `mp3DurationMs` and `wavDurationMs` estimate each segment's length, and the position is `starts[index] + currentTime`. If the estimate is off, the highlight jumps at each boundary. Compare the estimate with the decoded length.
6. **Rate change on load (E-11):** a click at a boundary at 1.5× or 2×.
7. **Stale events after a seek (E-04):** seek twice in quick succession near a boundary, then check the position and the end state.
8. **Running dry (E-02):** the Diagnostics timings for a chapter narrated at free tier. Does playback run dry at each segment?
9. **StrictMode (E-12):** does the dev build double-mount the provider?

## Coverage so far / not yet audited

**Audited end to end:** `src/audio/{lectio-engine,voice-player,native-engine,engine,voice-port,ambience-mixer}.ts`; `src/features/player/{playback-controller,player-store,player-provider,player-engine}.ts(x)`; `app/_layout.tsx`; `app/player.tsx` (effect only); the expo-audio focus, lock-screen and service sources; the react-native-audio-api focus sources; `modules/lectio-background` (`ProcessingService.kt`, `index.ts`); `src/features/pipeline/background-work.ts` (first 150 lines).

**Read partly or not at all:**
- `src/features/pipeline/{pipeline-lifecycle.tsx, processing-notice.ts, background-work.ts (rest), use-chapter-progress.ts}`, and `LectioBackgroundModule.kt` and `ProcessingNotifications.kt` beyond the IDs.
- The process-death path: queue restore on relaunch, and whether the notification clears after a kill. This is shared with QA-F.
- `src/audio/ambience-pack.ts`, `installed-beds.ts`, `ambience-mixer` decode timing on a device.
- `src/features/player/{full-player, transport, scrubber, sleep-timer, speed-sheet, sample-output, playable-announcer, narrating-ahead}`: UI-side ticks and the sleep-timer UI.
- Android 13 and 14 notification permission behaviour, and the Android 15 `dataSync` budget on a device.
- `mp3DurationMs` and `wavDurationMs` accuracy (hypothesis 5).

No device was used. Nothing here is verified on a phone, and every "Condition to confirm" and hypothesis needs the S1 checklist.

## Proposed fix order

1. E-03 (S, stops narration starting on its own).
2. E-01 (S, removes the per-boundary session teardown).
3. E-02 (M, the lead gate, the most likely user-visible stop-start).
4. E-04 and E-05 (S-M each).
5. E-06 and E-07 together (M-L, a single gapless player and a native media session). This is the J1 item from QA-B, and E-09 belongs with it.
6. E-08 needs a product decision before any change.

Each fix flips its proof test on. The proofs are excluded from `verify` until then.
