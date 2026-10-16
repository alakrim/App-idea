# src/audio

Playback engine, ambience mixer and media session (lock-screen controls).

**Layout**
- `engine.ts`: the `AudioEngine` interface that features code uses, and its state types.
- `lectio-engine.ts`: `createLectioEngine()`, the shared logic: timeline, beds, ducking, remote commands, interruptions. Voice, mixer and event sources are injected.
- `native-engine.ts`: `createNativeAudioEngine()`, the device build. Ambience runs on `react-native-audio-api`; narration uses `voice-player.ts` (expo-audio).
- `fake-engine.ts`: `createFakeEngine()`, for tests and the web preview, on a virtual clock.
- `voice-port.ts`, `voice-player.ts`: the narration port and its expo-audio player.
- `ambience-mixer.ts`, `ambience-pack.ts`: the bed mixer, and the bundled bed manifest (`resolveInstalledBed()`).

**Entry points**
- `engine.ts`: `AudioEngine`, `ChapterLoad`, `PlaybackState`.
- `native-engine.ts`: `createNativeAudioEngine()`.
- `lectio-engine.ts`: `createLectioEngine()`.
- `fake-engine.ts`: `createFakeEngine()`.

**Gotchas**
- Native modules are imported only here. `features/player/player-engine.ts` loads the native engine lazily, so the web bundle never evaluates it.
- Ambience is beds only: at most 2 beds, ducked under the voice, -22 dB by default (`core/playback`).
- Playback rate never enters the timeline, so a speed change cannot move a sentence.

**Tests**: `lectio-engine.test.ts` and `fake-engine.test.ts` cover the shared logic without a native module. Other `*.test.ts` sit beside each file. Run `npm test`.

**Import rules**

- May import from `src/core` and `src/services`. UI code comes in through `src/features`, never the other way round.
- Native audio modules are only used here, behind a small interface that tests can mock.
