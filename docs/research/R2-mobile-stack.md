# R2: Mobile stack and audio engine research

**Date**: 2026-10-11
**Brief**: `docs/briefs/R2-mobile-stack.md`
**Author**: haiku-worker
**Versions**: npm registry lookups (`npm view`) run on 2026-10-11. Docs pages are the Expo SDK 57 "latest" reference unless noted.

---

## TL;DR

- **Framework: working assumption confirmed.** Use **Expo SDK 57** (the latest stable SDK; SDK 58 is only on the `next` tag) with **React Native 0.86.x** and **TypeScript strict**. Flutter and Kotlin Multiplatform are viable but cost more for this app (Q1).
- **Audio: change the working assumption to a hybrid.**
  - Voice: **`expo-audio`** (SDK 57). It documents background playback, lock-screen controls, a gapless playlist and a pitch-corrected playback rate.
  - Ambience: **`react-native-audio-api`** 0.13.6 (Software Mansion). It documents sample-accurate loop points and GainNode ramps. `expo-audio` has no ramp API.
  - Reject `react-native-track-player` V5 (commercially licensed; V4 is legacy with no Expo support) and `react-native-sound` (no background or lock-screen support, no ramps).
- **Gate before committing to the hybrid:** a short device spike on Android. It must show that two engines can share one audio session, that ambience keeps looping during 45 min of background play, that lock-screen controls work, and that ducking is fast enough. Fallback: single engine (`react-native-audio-api` for voice too).
- **Storage:** `expo-sqlite` 57.0.4 (FTS5 is enabled by default in its config plugin; confirm on device) with `drizzle-orm` 0.45.4 stable. Live queries need `enableChangeListener: true`.
- **Background pipeline:** on Android, run a foreground service of type `dataSync` with a progress notification. On Android 15+ it gets a 6-hour budget per 24 hours, so checkpoint after each segment. On iOS a long pipeline cannot run in the background: pause and resume. `expo-background-task` is not suitable (15-minute minimum, system-timed).
- **Builds:** EAS Build free tier (15 Android + 15 iOS builds per month, low-priority queue with waits of 90+ minutes at peak) is enough to start. A local Android build is feasible (Gradle 8.14.3 is installed) but needs the Android SDK, which is not present. Install it with the Android CLI, since `sdkmanager` is deprecated.

---

## Pinned starting dependency list

Install with `npx expo install <pkg>` so SDK 57 picks compatible versions. The versions below are the current npm `latest` for each package, and they all fall on the SDK 57 line or peer-check cleanly against RN 0.86.

| Package | Version | Role / note |
|---|---|---|
| `expo` | 57.0.27 | SDK 57, latest stable |
| `react-native` | 0.86.3 | SDK 57 line (0.86.3 per SDK 57 patch notes). `expo install` decides the final value |
| `react` | 19.2.x | SDK 57 line |
| `expo-router` | 57.0.25 | Typed routes |
| `expo-audio` | 57.0.5 | Voice playback, lock screen, background |
| `react-native-audio-api` | 0.13.6 | Ambience loops and gain ramps. Pre-1.0: pin exactly |
| `react-native-worklets` | 0.13.x | Required by Reanimated 4.7 and by audio-api |
| `react-native-reanimated` | 4.7.1 | Peer `react-native` 0.86 to 0.88 (matches SDK 57) |
| `react-native-gesture-handler` | 3.3.0 | Gestures |
| `@shopify/react-native-skia` | 2.14.0 | Waveforms. Peers: React >=19, RN >=0.78, Reanimated >=4, Worklets >=0.7 |
| `@shopify/flash-list` | 2.3.3 | Chapter and library lists |
| `expo-image` | 57.0.5 | Cover art |
| `expo-haptics` | 57.0.3 | Haptics |
| `expo-sqlite` | 57.0.4 | Storage and FTS5 |
| `drizzle-orm` | 0.45.4 | ORM (stable line) |
| `drizzle-kit` (dev) | 0.31.11 | Migration generator |
| `expo-file-system` | 57.0.7 | Audio segments, PDFs, covers |
| `expo-secure-store` | 57.0.4 | BYOK API keys |
| `expo-document-picker` | 57.0.3 | PDF import |
| `expo-image-picker` | 57.0.20 | Series cover with crop |
| `expo-share-intent` | 8.0.1 | Android share intent. Peer `expo` ^57 |
| `@notifee/react-native` | 9.1.8 | Progress notification for the foreground service |
| `expo-background-task` | 57.0.21 | Optional. Periodic refresh only, not the pipeline |
| `zod` | 4.6.5 | Validate LLM and API output |
| `jest-expo` (dev) | 57.0.5 | Jest preset. Peer `@react-native/jest-preset` ^0.86.3 |
| `@testing-library/react-native` (dev) | 14.1.0 | Peers: React >=19, RN >=0.78, Jest >=29 |
| `eas-cli` (dev, via npx) | 24.12.1 | Builds |

**Deliberately not in the list**
- `react-native-track-player`: V5 is commercially licensed; V4 is legacy (see Q2).
- `react-native-sound` 0.13.0: no background or lock-screen support, no ramps.
- `expo-av` 16.0.8: `expo-audio` covers the same need on SDK 57. Its deprecation status was not checked in this run.
- npm package `maestro-runner` (1.1.28): not the Maestro CLI. Its provenance was not checked, so do not install it.

---

## Q1. Framework choice

| Criterion | Expo / React Native (SDK 57) | Flutter | Kotlin Multiplatform |
|---|---|---|---|
| Audio mixing (voice + ambience) | Two JS-accessible libraries: `expo-audio` and `react-native-audio-api` (Q2). Both are New Architecture compatible | `just_audio` (multiple players) plus `audio_service` 0.18.18, the handler model for lock screen and notifications. Multi-source mixing not verified in this run | No mature shared audio library. Build on Media3 (Android) and AVFoundation (iOS) through `expect`/`actual`. The closest third-party is `soundscape` 0.4.0 (May 2026), which is young |
| Background playback and lock screen | Documented in `expo-audio` (`enableBackgroundPlayback`, default `true`) and in `react-native-audio-api` (`PlaybackNotificationManager`) | `audio_service` is the established pattern | Media3 `MediaSessionService` is documented for Android. iOS Now Playing and remote commands are hand-built |
| Dev velocity | Highest for this team. TypeScript, same stack the brief assumes, OTA via EAS Update | Good. Dart is a second language | Lowest. Two native audio stacks and a shared UI layer to build |
| iOS reuse | Same codebase | Same codebase | Shared logic, but native audio per platform |
| Builds without a local Android SDK | EAS Build (free tier, see Q8) | Cloud build options exist; not checked here | Gradle needs the Android SDK on CI |

**Recommendation: Expo SDK 57 + React Native 0.86 + TypeScript strict.** Flutter is the fallback if the audio spike in Q2 fails on React Native. KMP is not worth the cost for an app of this size.

Sources:
- Expo SDK 57 reference, audio: https://docs.expo.dev/versions/latest/sdk/audio/
- `audio_service` on pub.dev: https://pub.dev/packages/audio_service
- Media3 background playback: https://developer.android.com/media/media3/session/background-playback
- `soundscape` KMP audio (klibs): https://klibs.io/package/io.github.nadeemiqbal/soundscape-player
- Expo SDK 57 changelog (RN 0.86): https://expo.dev/changelog/sdk-57 (seen in search summary, not fetched)

---

## Q2. Audio engine

### Comparison

| Criterion | `expo-audio` 57.0.5 | `react-native-audio-api` 0.13.6 | `react-native-track-player` | `react-native-sound` 0.13.0 |
|---|---|---|---|---|
| 2+ simultaneous sources | Not documented. Each `AudioPlayer` is an instance; test on device | Web Audio graph: several `AudioBufferSourceNode`s into one destination. Concurrency limit not documented in the pages read; test | V5 is commercial. V4 has one queue. Not documented for simultaneous players | Multiple `Sound` objects; no docs statement |
| Per-source volume ramp | **No ramp API.** Only `volume` (0.0 to 1.0) and `muted` | **Yes.** `GainNode.gain` is an `AudioParam`. Docs show `linearRampToValueAtTime` and `exponentialRampToValueAtTime`, and warn that direct gain changes click | No | `setVolume` only |
| Seamless ambience loop | `loop` boolean. Gaplessness not documented | `AudioBufferSourceNode` with `loop`, `loopStart`, `loopEnd`, `onLoopEnded`. Loops within the buffer, so the seam is set by the sample data. Expected sample-accurate; confirm by ear | No | `setNumberOfLoops(-1)` loops indefinitely (iOS exact counts only) |
| Gapless voice queue | **Yes.** `createAudioPlaylist` / `useAudioPlaylist`, "with gapless playback support", plus `preload()` | `AudioBufferQueueSourceNode` (`enqueueBuffer`, `dequeueBuffer`, `clearBuffers`). Documented as **mobile-only**. Gapless behaviour not stated | Queue plus preload, described as "gapless-like" | No |
| Background, lock screen, Bluetooth | `enableBackgroundPlayback` (default `true`: Android media FGS and iOS audio mode). `setActiveForLockScreen`. **Only one player can own the lock screen.** Audio stops after about 3 min in background without lock-screen controls. Stops when headphones or Bluetooth disconnect | `PlaybackNotificationManager` (lock screen and notifications). Background needs the Expo plugin (iOS background mode, Android FGS). On iOS the AudioContext state is tied to lock-screen state | Full remote-control support (lock screen, notification, headset). Android Auto listed |
| Playback rate with pitch | `playbackRate` 0.1 to 2.0 on Android, 0.0 to 2.0 on iOS. `shouldCorrectPitch` (default `true`). `setPlaybackRate(rate, quality)`, quality is iOS-only | Pitch correction is a per-node option (`pitchCorrection` on `createBufferSource` / `createBufferQueueSource`). Adds latency. The rate semantics were not in the pages read | Not in the README |
| Expo / New Architecture | Expo module, SDK 57 config plugin (`enableBackgroundPlayback`, `enableBackgroundRecording`) | Expo config plugin exists. Peer `react-native-worklets` >=0.7. Pre-1.0 (0.13.6) | V5 requires New Architecture and RN 0.76+. No Expo mention in README | New Architecture supported (TurboModules). Last npm publish 2025-10-15 |
| License | MIT | MIT | **V5: commercial** (`@rntp/player` 5.12.1, "Commercial use requires a license"). **V4: Apache-2.0** (npm `react-native-track-player` 4.1.2, branch `v4`) | MIT |

### Track-player licensing

V5 is commercially licensed. The README says: "Starting with V5, react-native-track-player is commercially licensed," and "Commercial use requires a license." Pricing is at rntp.dev/pricing. V4 remains Apache-2.0 on the `v4` branch, but it is legacy and has no Expo mention. **Do not adopt track-player for this app.**

### Recommendation: hybrid architecture

- **Voice on `expo-audio`.** The voice path needs lock-screen control, background playback, gapless segment transitions and a pitch-corrected speed control. Those are all documented for `expo-audio`, and it is versioned with the SDK.
- **Ambience on `react-native-audio-api`.** The ambience path needs sample-accurate looping and gain automation. `expo-audio` offers neither (volume only), and `audio-api` documents both.
- **Ducking is app-level.** When the voice starts, ramp ambience gain down (for example to 0.2 over about 300 ms). When it stops, ramp it back up. Drive the ramps from `expo-audio` status events. Measure the latency in the spike.
- **Lock screen belongs to the voice.** `expo-audio` is the one lock-screen owner, which fits the requirement. Ambience does not need its own lock-screen controls.

**Why not one engine?** `react-native-audio-api` for everything would give one graph and sample-accurate ducking. It is the fallback, but two gaps are unverified: whether `AudioBufferQueueSourceNode` is gapless, and how much latency pitch correction adds to speech. Test both in the spike before choosing it.

### Spike (gate, Android device)

1. 45 min of voice playback with ambience looping, screen off. Pass: no dropouts, no ambience seam audible.
2. Lock-screen play, pause and seek from the notification and the lock screen.
3. Audio focus: a phone call and another app's audio. Pass: voice pauses and ambience ducks or pauses correctly.
4. Speed 0.5x and 2x on speech: pitch quality acceptable.
5. Ducking latency: voice start to ambience reaching 0.2 gain. Target under 100 ms.
6. Session ownership: both libraries configure the platform audio session. Confirm one owner, and confirm that `setAudioModeAsync` (expo-audio) and the audio-api session configuration do not fight each other.

### Sources
- `expo-audio` SDK 57: https://docs.expo.dev/versions/latest/sdk/audio/
- `react-native-audio-api` GitHub: https://github.com/software-mansion/react-native-audio-api
- `AudioBufferSourceNode`: https://docs.swmansion.com/react-native-audio-api/docs/sources/audio-buffer-source-node
- `AudioBufferQueueSourceNode`: https://docs.swmansion.com/react-native-audio-api/docs/sources/audio-buffer-queue-source-node
- `GainNode`: https://docs.swmansion.com/react-native-audio-api/docs/effects/gain-node
- `react-native-audio-api` best practices (AudioContext lifecycle, iOS lock screen): https://docs.swmansion.com/react-native-audio-api/docs/fundamentals/best-practices
- `react-native-audio-api` background and `PlaybackNotificationManager` guidance (search snippet): https://docs.swmansion.com/react-native-audio-api/docs/next/fundamentals/best-practices
- `react-native-track-player` README (V5 license, Expo, V4 branch): https://github.com/doublesymmetry/react-native-track-player
- `react-native-sound`: https://github.com/zmxv/react-native-sound

---

## Q3. Storage

**`expo-sqlite` 57.0.4 and FTS5.** The SDK 57 docs say the config plugin has `enableFTS` ("Whether to enable the FTS3, FTS4 and FTS5 extensions"), and its default is `true`. This applies to projects with Continuous Native Generation. The docs do not list the bundled compile options per platform. Confirm on a device with `SELECT sqlite_compileoption_used('ENABLE_FTS5')` on Android and iOS, then create an FTS5 table.

**Live queries.** `openDatabaseSync(name, { enableChangeListener: true })` is required. Without it, `addDatabaseChangeListener` and the Drizzle live query do not fire. `useNewConnection` defaults to `false`.

**Drizzle ORM 0.45.4 (stable).** The Expo Drizzle page points to `drizzle-orm@rc` and `expo-sqlite@next`, which is the SDK 58 line. Use the stable `0.45.4` with `expo-sqlite@57.0.4` for SDK 57 and check that the migrator and live query APIs match the docs. Setup, per the Drizzle Expo page:
- `useLiveQuery(db.select().from(...))` returns `data`.
- Migrations are generated with `drizzle-kit generate` (`dialect: 'sqlite'`, `driver: 'expo'` in `drizzle.config`), bundled as SQL strings with `babel-plugin-inline-import` (`extensions: [".sql"]`), and `sql` is added to Metro `sourceExts`.
- Run them at startup with `useMigrations(db, migrations)` from `drizzle-orm/expo-sqlite/migrator`.

**`expo-file-system` 57.0.7 (new API).** Use `File`, `Directory` and `Paths` (`Paths.document` is the persistent location). The legacy API is at `expo-file-system/legacy` and is deprecated. The reference docs list `File.createDownloadTask` for downloads. The `File.downloadFileAsync` used in one example is not in the reference, so verify before use. Store audio segments as files and keep their paths in SQLite.

**`expo-secure-store` 57.0.4.** Android: SharedPreferences encrypted with the Keystore. iOS: Keychain generic password items. No Expo-enforced size limit (historical iOS limit around 2048 bytes). Store only BYOK keys here, not data.
- **Accessibility matters for background work.** The default `WHEN_UNLOCKED` makes a key unreadable while the device is locked. A pipeline that reads the key while locked will fail on iOS. Use `AFTER_FIRST_UNLOCK` for that key. The `_THIS_DEVICE_ONLY` variant of `AFTER_FIRST_UNLOCK` is marked deprecated in the docs, so that trade-off is an architect decision (Open issues).

Sources:
- `expo-sqlite` SDK 57: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Drizzle with Expo SQLite: https://orm.drizzle.team/docs/connect-expo-sqlite
- `expo-file-system` SDK 57: https://docs.expo.dev/versions/latest/sdk/filesystem/
- `expo-secure-store` SDK 57: https://docs.expo.dev/versions/latest/sdk/secure-store/
- Drizzle live query version (search snippet, v0.31.1): https://blog.logrocket.com/drizzle-react-native-expo-sqlite/

---

## Q4. Inputs

- **PDF: `expo-document-picker` 57.0.3.** Use it as the brief asks. `expo-file-system` also has `File.pickFileAsync({ initialUri, mimeTypes })`; pick one in the architecture decision.
- **Cover image: `expo-image-picker` 57.0.20, `allowsEditing` with crop.**
  - Android: crop and rotate, and `aspect` is honored.
  - iOS: crop only, and the crop rectangle is always a square. `aspect` is ignored on iOS.
  - Editing is mutually exclusive with `allowsMultipleSelection`.
  - Known iOS issue: for some high-resolution images the crop rectangle value can be wrong.
  - Recommendation: square crop (`aspect: [1, 1]`) on both platforms, which gives consistent cover art and matches iOS.
  - Returned asset: `uri`, `width`, `height` (`0` if unknown).
- **Android share intent: `expo-share-intent` 8.0.1.** Peer `expo` ^57 (verified on npm). It needs a config plugin that adds intent filters to the manifest, so it needs a development build and does not run in Expo Go. Chrome sends a shared URL as `ACTION_SEND` with `text/plain`. This is an inference: confirm with a device test. The package README was not fetched (the npm page returned 403), so its option names are unverified. Routing the incoming share goes through Expo Router's `+native-intent` file.
- **iOS share extension:** out of scope for Android-first.

Sources:
- `expo-image-picker` SDK 57: https://docs.expo.dev/versions/latest/sdk/imagepicker/
- `expo-share-intent` on npm: https://www.npmjs.com/package/expo-share-intent
- `expo-file-system` (picker method): https://docs.expo.dev/versions/latest/sdk/filesystem/

---

## Q5. Background work (pipeline of about 100 TTS segments)

**What is realistic.**
- **Android: foreground service of type `dataSync`.** On Android 15+ (apps targeting it), `dataSync` and `mediaProcessing` foreground services get 6 hours of total time per 24-hour window, tracked per type. When the budget runs out the system calls `Service.onTimeout(int, int)`, and the service must call `stopSelf()` within a few seconds, or the system throws an exception. After the budget is spent, a new `dataSync` service cannot start until the user brings the app to the foreground. **A 100-segment pipeline fits inside 6 hours if each segment is a few minutes or less; measure.** Checkpoint after each segment so a timeout or kill resumes cleanly. Use `@notifee/react-native` (9.1.8) for the progress notification bound to the service; the notification API was not verified in docs in this run.
- **Android alternative:** `react-native-background-actions` 4.1.0 wraps the Android foreground service with less control. Notifee is the better fit for progress UI.
- **Android: `expo-background-task` 57.0.21.** Uses WorkManager. The minimum interval is **15 minutes**, the default is 12 hours, and the system decides when to run. It is for deferrable work (sync, refresh), not a pipeline.
- **iOS: no long background compute.** `expo-background-task` uses BGTaskScheduler, which is system-timed, "short intervals are often ignored," and unavailable on simulators. The pipeline must pause when the app is backgrounded and resume on foreground. Checkpoint per segment so that resume is cheap. BGTask can help opportunistically but is not guaranteed.
- **Keys and network.** BYOK keys live on the device, so the pipeline must run on the device. A server-side pipeline is not an option under the current design (CLAUDE.md).

Sources:
- Android foreground service timeout (Android 15): https://developer.android.com/develop/background-work/services/fg-service-timeout
- `expo-background-task` SDK 57: https://docs.expo.dev/versions/latest/sdk/background-task/
- `@notifee/react-native` on npm: https://www.npmjs.com/package/@notifee/react-native
- `react-native-background-actions` on npm: https://www.npmjs.com/package/react-native-background-actions

---

## Q6. UI kit

Recommended minimal set (all on the SDK 57 line; peer ranges checked on npm):

- **Reanimated 4.7.1** with **react-native-worklets 0.13.x**. Peer `react-native` 0.86 to 0.88.
- **Gesture Handler 3.3.0.** Peer is any RN, so it is compatible with RN 0.86.
- **Skia 2.14.0** for waveforms. Peers: React >=19, RN >=0.78, Reanimated >=4, Worklets >=0.7.
- **FlashList 2.3.3** for lists. Peers are generic.
- **expo-image 57.0.5** for covers.
- **expo-haptics 57.0.3** for haptics.
- **expo-router 57.0.25** with typed routes.
- **Theming:** dark-first, with our own spacing and typography tokens. No third-party UI kit: a kit would add weight and fight the custom premium look the brief asks for.

Sources: npm registry (`npm view` peer metadata, run 2026-10-11) for each package at https://www.npmjs.com/package/<name>. Expo SDK 57 reference: https://docs.expo.dev/versions/latest/sdk/

---

## Q7. Testing

- **Unit tests: Jest with `jest-expo` 57.0.5 and `@testing-library/react-native` 14.1.0.**
  - Install: `npx expo install jest-expo jest @types/jest --dev`. Preset: `"jest": { "preset": "jest-expo" }`.
  - The Expo guide recommends React Native Testing Library, which replaces `react-test-renderer`, and notes it does not support React 19+.
  - Peer checks: `jest-expo` 57.0.5 needs `@react-native/jest-preset` ^0.86.3, which matches our RN line. RNTL 14.1.0 needs React >=19, RN >=0.78, Jest >=29.
- **Mocking native modules.** `jest-expo` mocks the Expo SDK's native parts. It does **not** mock `react-native-audio-api` (not an Expo module): write `jest.mock('react-native-audio-api', ...)` ourselves, and do the same for any module that is not in the Expo preset. The Expo guide does not cover custom mocks; this is our recommendation.
- **E2E: Maestro, later.** Flows live in `.maestro/`, each with an `appId`. The Expo tutorial runs Maestro on EAS Workflows (`type: maestro` job, **alpha**), against an Android emulator or iOS simulator build. Locally, `maestro test flow.yaml` needs a running device. Maestro CLI version and install commands were not confirmed (the docs page gave no version; the install page was not fetched). Install from mobile.dev when needed.

Sources:
- Expo unit testing: https://docs.expo.dev/develop/unit-testing/
- Expo E2E tutorial (Maestro on EAS): https://docs.expo.dev/tutorial/cicd/e2e-tests.md
- Maestro CLI docs: https://docs.maestro.dev/maestro-cli/
- `@testing-library/react-native` on npm: https://www.npmjs.com/package/@testing-library/react-native
- `jest-expo` on npm: https://www.npmjs.com/package/jest-expo

---

## Q8. Builds without a local Android SDK

**EAS Build free tier** (Expo pricing page, no date shown):
- 15 Android and 15 iOS builds per month. Build timeout 45 minutes.
- Low-priority queue. "At peak times, you may experience wait times of 90+ minutes."
- 1 build concurrency.
- Workflows: 60 minutes; free includes 1 workflow concurrency. Maestro end-to-end jobs and large workers are not included.
- Starter ($19/month): high-priority queue, $45 of build credit, 1 concurrency.

**Recommendation:** start on the free tier. Use cloud development builds for daily work and upgrade to Starter if the queue becomes the bottleneck.

**Local Android build (fallback).**
- Present: Gradle 8.14.3 on PATH, and a JDK on PATH (the version was not captured in this run).
- Missing: `ANDROID_HOME` is unset and no Android SDK is installed.
- `sdkmanager` is **deprecated** per the Android developer docs. Use the Android CLI instead: `android sdk [install|list|update|remove]` (https://developer.android.com/tools/agents/android-cli/commands/sdk). Get the standalone command-line tools from https://developer.android.com/studio#command-line-tools-only.
- Then: set `ANDROID_HOME`, install `platform-tools`, the platform and build-tools that the SDK 57 template targets (check the generated `build.gradle`), and accept licenses.
- Use the generated Gradle wrapper (`./gradlew`) rather than the global Gradle, since `expo prebuild` writes its own wrapper.
- A third-party guide says Linux needs 64-bit glibc 2.31+ and that ARM Linux is unsupported. Unverified.

Sources:
- EAS pricing: https://expo.dev/pricing
- Android sdkmanager (deprecation notice): https://developer.android.com/tools/sdkmanager
- Android CLI `sdk` command: https://developer.android.com/tools/agents/android-cli/commands/sdk

---

## Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | `react-native-audio-api` is pre-1.0 (0.13.6). The docs warn constructor options differ between the `next` and stable pages | Medium / High | Pin the version exactly. Wrap it behind our own `AmbienceEngine` interface so swapping it is local. Keep the single-engine fallback in view |
| 2 | Two engines fight over the platform audio session | Medium / High | Name one session owner in the architecture. Verify in the spike (Q2, item 6) |
| 3 | `expo-audio` has no ramp API, so ducking depends on status-event latency | Medium / Medium | Measure in the spike (target under 100 ms). If too slow, move voice to the single-engine option |
| 4 | Ambience memory: a looped file is decoded fully into an `AudioBuffer`. 60 s stereo at 48 kHz float32 is about 23 MB | High / Medium | Use mono or 44.1 kHz for beds, short loops, cap at two simultaneous beds, and unload beds when the chapter ends |
| 5 | Android 15 `dataSync` 6-hour budget | Low / High | Checkpoint per segment, resume on timeout, show progress |
| 6 | iOS cannot run the pipeline in the background | High / Medium | Pause and resume. Make the pipeline resumable. Tell the user when a job is paused |
| 7 | `react-native-track-player` V5 requires a commercial license | Certain if adopted | Not adopted |
| 8 | SDK churn: SDK 58 is in beta, and the Drizzle and expo-sqlite docs point at `rc` and `next` tags | Medium / Medium | Pin SDK 57 and all `57.x` packages. Upgrade deliberately, in a separate task |
| 9 | FTS5 availability is not confirmed on device | Low / Medium | Run `sqlite_compileoption_used('ENABLE_FTS5')` on both platforms in the first sprint |
| 10 | iOS secure-store reads fail while locked | Medium / High | Use `AFTER_FIRST_UNLOCK` for the BYOK key (architect decision) |
| 11 | EAS free-tier queue waits of 90+ minutes | High / Low | Cloud dev builds in batches. Local Gradle build as fallback. Starter if needed |
| 12 | Share intent needs a development build (not Expo Go) | Certain / Low | Plan for dev builds from the first scaffold |

---

## Evidence

**Commands run (npm registry, 2026-10-11).** Latest versions for each package, plus dist-tag checks on the packages where `latest` and `next` differ:

```
expo                              latest 57.0.27   next 58.0.7   (sdk-57 57.0.27)
expo-audio                        latest 57.0.5    next 58.0.8
expo-sqlite                       latest 57.0.4    next 58.0.11
expo-background-task              latest 57.0.21   next 58.0.10
react-native                      latest 0.87.1   (SDK 57 ships 0.86.x)
react-native-track-player         latest 4.1.2     next 4.0.0-rc09
@rntp/player                      5.12.1           license: SEE LICENSE IN <license.txt>
react-native-track-player (v4)    license Apache-2.0
react-native-audio-api            latest 0.13.6    tags: latest, audio-api-nightly
react-native-sound                0.13.0           license MIT   modified 2025-10-15
drizzle-orm                       latest 0.45.4    rc 1.0.0-rc.4   beta 1.0.0-beta.22
drizzle-kit                       0.31.11
expo-file-system                  57.0.7
expo-secure-store                 57.0.4
expo-document-picker              57.0.3
expo-image-picker                 57.0.20
expo-share-intent                 8.0.1     peers: expo ^57, expo-constants >=57.0.3, expo-linking >=57.0.1
expo-router                       57.0.25
react-native-reanimated           4.7.1     peers: react-native 0.86 - 0.88, react-native-worklets 0.13.x
react-native-gesture-handler      3.3.0
@shopify/flash-list               2.3.3
@shopify/react-native-skia        2.14.0    peers: react >=19, RN >=0.78, worklets >=0.7, reanimated >=4
expo-image                        57.0.5
expo-haptics                      57.0.3
jest-expo                         57.0.5    peers: @react-native/jest-preset ^0.86.3
@testing-library/react-native     14.1.0    peers: react >=19, RN >=0.78, jest >=29
@notifee/react-native             9.1.8     peer: react-native *
react-native-background-actions   4.1.0
zod                               4.6.5
eas-cli                           24.12.1
maestro-runner (npm)              1.1.28   (not the Maestro CLI)
expo-av                           16.0.8
expo@57.0.27 deps: babel-preset-expo ~57.0.14, expo-modules-core ~57.0.21
```

**Local toolchain:**

```
java:   present on PATH (version banner obscured by JAVA_TOOL_OPTIONS proxy line; version not captured)
gradle: Gradle 8.14.3
node:   v22.22.0
ANDROID_HOME=unset; no Android SDK directory found
```

**Docs and search calls** (WebFetch / WebSearch). Results were read and summarized; sources are listed per section. Failed fetches, which are unverified: `docs.swmansion.com/react-native-audio-api/` overview (404), `expo.dev` share-intent README via npm (403), `docs.expo.dev/versions/latest/sdk/image-picker/` (404; the `imagepicker` slug worked), `docs.expo.dev/versions/latest/sdk/background-task/` (fetched OK), `docs.expo.dev/versions/latest/sdk/file-system/` (404; `filesystem` worked), `docs.expo.dev/versions/latest/sdk/sqlite` (fetched OK), `docs.maestro.dev/` (no version found).

---

## Decisions and assumptions

- **Expo SDK 57 is "latest SDK".** SDK 58 is on the `next` tag (beta). Pinned to 57.
- **React Native 0.86.x, not 0.87.** npm `latest` for `react-native` is 0.87.1, but SDK 57 ships 0.86 (and 0.86.3 per SDK 57 patch notes). The app follows the SDK, not npm latest.
- **New Architecture is always on.** The Expo guide: "SDK 55 and later run entirely on the New Architecture" and "SDK 54 is the last SDK version where the New Architecture can be disabled." Legacy-architecture-only libraries are excluded.
- **Hybrid audio** (expo-audio for voice, react-native-audio-api for ambience) is the recommendation, conditional on the spike.
- **Drizzle stable (0.45.4)** chosen over the `rc` tags the Expo page uses. The migrator and live-query APIs are assumed to be the same; verify on the first build.
- **Android first.** iOS items are noted but not gated.
- **Expo Starter is not recommended yet.** Free tier is enough to start.

---

## Open issues for the architect

1. **Docs gap:** `docs/CONVENTIONS.md` and `docs/STATE.md` do not exist in the repo, though the worker instructions name them. Not created here (the brief says do not modify other files). Please add them or confirm the paths.
2. **Approve the hybrid audio architecture**, and schedule the Android spike. The spike needs a physical Android device, which the user must provide.
3. **iOS pipeline behaviour:** pause-and-resume, or accept a foreground-only pipeline on iOS for v1?
4. **Secure-store accessibility** for the BYOK key: `AFTER_FIRST_UNLOCK` (needed for background reads, deprecated device-only variant avoided) versus `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Decide.
5. **PDF picker:** `expo-document-picker` (brief) or `expo-file-system` `File.pickFileAsync`.
6. **Unverified claims to check in the first sprint:** expo-audio simultaneous players; audio-api concurrency and `playbackRate` semantics; audio-api `AudioBufferQueueSourceNode` gaplessness; expo-share-intent README options; Notifee progress API; Maestro CLI install and version; required JDK version for RN 0.86; Android platform and build-tools versions for the SDK 57 template.
7. **Budget:** whether to move from EAS free tier to Starter ($19/month) once the build queue becomes a bottleneck.

---

## Sources (consolidated)

- Expo SDK 57 reference: https://docs.expo.dev/versions/latest/sdk/audio/ , https://docs.expo.dev/versions/latest/sdk/sqlite/ , https://docs.expo.dev/versions/latest/sdk/filesystem/ , https://docs.expo.dev/versions/latest/sdk/secure-store/ , https://docs.expo.dev/versions/latest/sdk/imagepicker/ (slug `imagepicker`; the `image-picker` path returned 404 in this run), https://docs.expo.dev/versions/latest/sdk/background-task/
- Expo guides: https://docs.expo.dev/guides/new-architecture/ , https://docs.expo.dev/develop/unit-testing/ , https://docs.expo.dev/tutorial/cicd/e2e-tests.md
- Expo changelog: https://expo.dev/changelog/sdk-57 , pricing: https://expo.dev/pricing
- Drizzle + Expo SQLite: https://orm.drizzle.team/docs/connect-expo-sqlite
- react-native-audio-api: https://github.com/software-mansion/react-native-audio-api , https://docs.swmansion.com/react-native-audio-api/docs/sources/audio-buffer-source-node , https://docs.swmansion.com/react-native-audio-api/docs/sources/audio-buffer-queue-source-node , https://docs.swmansion.com/react-native-audio-api/docs/effects/gain-node , https://docs.swmansion.com/react-native-audio-api/docs/fundamentals/best-practices
- react-native-track-player: https://github.com/doublesymmetry/react-native-track-player
- react-native-sound: https://github.com/zmxv/react-native-sound
- Android: https://developer.android.com/media/media3/session/background-playback , https://developer.android.com/develop/background-work/services/fg-service-timeout , https://developer.android.com/tools/sdkmanager , https://developer.android.com/tools/agents/android-cli/commands/sdk
- Flutter audio: https://pub.dev/packages/audio_service
- Kotlin Multiplatform audio: https://klibs.io/package/io.github.nadeemiqbal/soundscape-player
- Maestro: https://docs.maestro.dev/maestro-cli/
- npm registry (versions and peer dependencies, run 2026-10-11): https://www.npmjs.com/package/<name>
