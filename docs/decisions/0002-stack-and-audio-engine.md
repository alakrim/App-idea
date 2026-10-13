# ADR-0002: Expo SDK 57 + hybrid audio engine

**Status**: accepted, conditional on the device spike (S1) (2026-10-11). Evidence: `docs/research/R2-mobile-stack.md`.

## Decision
- **Expo SDK 57**, React Native 0.86, TypeScript strict, expo-router, New Architecture.
- **Voice track: `expo-audio`.** It provides lock screen and media session, background playback, a gapless playlist, and pitch-corrected rates of 0.5–2×.
- **Ambience beds: `react-native-audio-api`.** It provides sample-accurate loops and `GainNode` ramps for fades and ducking. `expo-audio` has no ramp API.
- Both sit behind our own `AudioEngine` interface (`src/audio/engine.ts`). If the spike fails, we swap the implementation (fallback: everything on `react-native-audio-api` with our own media session) without touching features.
- Rejected:
  - `react-native-track-player` v5: commercial license. v4 is legacy.
  - `react-native-sound`: no background playback, no ramps.
- **Storage**: `expo-sqlite` (FTS5 enabled) + `drizzle-orm` 0.45.x with `enableChangeListener` for live queries. Files go through the `expo-file-system` new API.
- **Key storage**: `expo-secure-store` with `AFTER_FIRST_UNLOCK`, so the background pipeline can read the key.
- **Long jobs**:
  - Android runs them in a foreground service (`dataSync`) with a progress notification and checkpoints after every segment.
  - iOS (later) runs jobs only in the foreground and resumes them on return.
- **Inputs**: `expo-document-picker` (PDF), `expo-image-picker` (cover, crop), and a share-intent plugin for URL/PDF shared from other apps.

## Spike S1 (needs the user's Android device)
On a dev build, run two engines on one audio session for 45 minutes in the background. Check lock-screen control and measure ducking latency. Until then, all feature code programs against `AudioEngine` and its fake.

## Amendment (F1, 2026-10-13): interruptions, focus and beds

- **Focus is owned by expo-audio alone.** The native engine listens to no interruption feed. Phone calls and other focus losses pause the narration in expo-audio, and the engine follows the voice snapshots. Subscribing to react-native-audio-api's interruptions requested a second focus client and caused the stop-start loop (incident 3). The dead interruption path was deleted, not kept.
- **`doNotMix` stays (decision, F1 item 7).** The narration's audio mode is `interruptionMode: 'doNotMix'`, so a navigation prompt pauses the narration instead of ducking under it. The trade-off is deliberate: the lock-screen controls depend on that mode, and a prompt that pauses the narration is clearer than one that talks over it. Ducking applies only to the beds, never to the prompt. Revisit with the S1 device check on navigation prompts, and with J1 (native media session).
- **Beds follow the transport.** Beds sound only while the voice plays or buffers. They fade out 350 ms after the voice stops (so a segment swap does not flicker them) over 600 ms, and they fade back in on play. Ducking dips the beds only while the voice plays, and it holds until the beds have faded, so a pause never makes them louder. The audio clock is suspended 2 s after the beds go silent, and resumed by the next bed start.
- **One level range.** Bed levels are −40…0 dB relative to the narration, ducking is 0…24 dB, and both the settings and the player sheet use these ranges from `src/core/playback/ranges.ts`. The default ducking stays 7 dB.
- **Decoded beds are bounded by bytes** (48 MB by default), not by count.
