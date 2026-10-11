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
