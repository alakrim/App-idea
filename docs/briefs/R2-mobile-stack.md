# Brief R2: Mobile stack and audio engine research

**Type**: research. No code. Today is 2026-10-11, so prefer 2026 sources and state exact current versions.

## Context
Lectio is an Android-first app (iOS planned, same codebase preferred) that plays a narrated audiobook (a sequence of TTS audio segments, one per paragraph or sentence group). **At the same time** it plays looping ambience beds (rain, horses, battle...) that fade in and out at specific sentences, ducked under the voice. It must keep playing in the background with lock-screen and notification controls, a speed control (0.5–2x, pitch preserved), a sleep timer, and a karaoke-style highlight of the current sentence.

The working assumption is **Expo (latest SDK) + React Native + TypeScript**. Validate or refute this.

## Questions (answer each one with sources and versions)
1. **Framework choice.** Compare Expo/React Native vs Flutter vs Kotlin Multiplatform *for this app specifically*: audio mixing, background playback, dev velocity, iOS reuse, and the ability to build without a local Android SDK (EAS Build). Recommend one.
2. **Audio engine.** Compare `expo-audio`, `react-native-track-player` (v4/v5), `react-native-audio-api` (Software Mansion, Web Audio API), and `react-native-sound`:
   - Can it play 2+ sources simultaneously (voice plus 1–2 ambience loops) with per-source volume ramps?
   - Seamless/gapless looping of an ambience file?
   - Gapless queue of voice segments?
   - Background playback, media session / lock screen / Bluetooth controls on Android and iOS?
   - Playback rate with pitch correction?
   - Expo config-plugin / New Architecture compatibility?
   - Recommend an architecture, e.g. "track-player for voice + media session, react-native-audio-api for ambience", or a single engine. Explain the precise reasons.
3. **Storage.** `expo-sqlite` (FTS5 availability on Android/iOS), Drizzle ORM with expo-sqlite (migrations, live queries), file storage via `expo-file-system` (new API), and secure key storage via `expo-secure-store`.
4. **Inputs.** `expo-document-picker` for PDF, `expo-image-picker` for series cover with crop, Android share intent (receive a URL or PDF shared from Chrome or other apps; `expo-share-intent` or similar).
5. **Background work.** Long pipeline jobs (cleanup → analysis → translate → TTS of ~100 segments) while the app is backgrounded on Android: `expo-background-task`, foreground service options, notifications with progress. What is realistic?
6. **UI kit.** For a premium look: Reanimated 3/4, Gesture Handler, `expo-router` (typed routes), FlashList, `expo-image`, Skia (waveforms), haptics, theming (dark-first). Recommend a minimal, high-quality set.
7. **Testing.** Jest + `@testing-library/react-native` setup with Expo (jest-expo preset), plus mocking native modules. Also **Maestro** for E2E later.
8. **Builds without a local Android SDK**: EAS Build free tier limits, and `expo prebuild` + Gradle locally (we have Java + Gradle but no Android SDK; could we install cmdline-tools?).

## Deliverable
Write `docs/research/R2-mobile-stack.md` with:
- TL;DR recommendation
- A pinned dependency list (package@version) we should start with
- One section per question with sources
- Risks and mitigations

Do not modify any other file.
