# Brief A2: Audio engine (voice + ambience mixer) and playback scheduler

**Type**: implementation. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/ARCHITECTURE.md` §5–6, **`docs/decisions/0002-stack-and-audio-engine.md`**, **`0005-ambience.md`**, `docs/research/R2-mobile-stack.md` (the audio section), `docs/specs/domain.md` (AudioSegment, AmbienceCue), and `src/core/text/timing.ts` (`sentenceAt`).

## Goal
A production-grade playback engine. Narration segments play gaplessly with lock-screen controls. Ambience beds fade in, duck and fade out on sentence boundaries. Everything sits behind a typed interface with a fake, so features and tests never touch native modules directly.

## Part 1: pure scheduler (`src/core/playback/`, Node-tested)
1. `timeline.ts`: from `AudioSegment[]` (with `durationMs`, `sentenceOffsetsMs`), build a chapter timeline. Functions:
   - `positionToSentence(ms)`
   - `sentenceToPosition(idx)`
   - `segmentAt(ms) → {segmentIdx, offsetInSegmentMs}`
   - `totalDurationMs`
   - `isSentenceAvailable(idx)` for progressive playback, where later segments are not yet generated
2. `ambience-scheduler.ts`: `planBeds(cues: AmbienceCue[] (enabled only), sentenceIdx) → BedTarget[]`, where `BedTarget = { cueId, category, gainDb, fadeMs }` (at most 2, higher confidence wins). Also a `diffBeds(prev, next)` producing `BedCommand[]` (`start`, `stop` with fadeOut, `retarget` gain). Gain = `settings.levelDb` + an intensity offset (low −3, medium 0, high +3 dB), clamped to [−30, −12]. Seeking across cues must produce the correct commands, with no orphan beds.
3. `ducking.ts`: `duckEnvelope({ voiceActive, duckingDb, attackMs: 30, releaseMs: 550 })`, a pure function returning gain-ramp parameters for the mixer. The voice is "active" while a segment is playing (not paused). We don't do per-word VAD in v1.
4. Tests covering all of the above, including seek-back, seek-forward over a cue's end, overlapping cues, speed changes (the timeline stays in media time) and the progressive-availability gate.

## Part 2: engine interface + implementations (`src/audio/`)
1. `engine.ts`: the `AudioEngine` interface.
   - `load(chapter: {id, title, seriesTitle, coverUri, segments: {uri, durationMs}[]}, startMs)`
   - `play()`, `pause()`, `seekTo(ms)`, `setRate(0.5..2)`, `appendSegments(...)` (progressive)
   - `setAmbience(commands: BedCommand[])`, `setAmbienceMaster(enabled, levelDb)`
   - `onPosition(cb)` (≈ 4 Hz plus every sentence change), `onState(cb)` (`idle|loading|playing|paused|buffering|ended|error`), `onRemoteCommand(cb)` (play/pause/next/prev/seek from the lock screen)
   - `dispose()`
2. `fake-engine.ts`: a deterministic in-memory implementation driven by a virtual clock, used by feature tests.
3. `voice-player.ts` (expo-audio):
   - Playlist of segment files, gapless if the API supports it (per R2). Otherwise preload the next player and swap on finish.
   - Pitch-corrected rate. Lock-screen/media-session metadata (title, series, cover artwork, duration). `setAudioModeAsync` for background playback and `interruptionMode` ducking others. Handle interruptions (phone call → pause; resume if it was playing).
   - Read the installed `expo-audio` 57 typings (`node_modules/expo-audio/build/*.d.ts`) and use **only real APIs**. Cite the type names in comments where it is non-obvious.
4. `ambience-mixer.ts` (react-native-audio-api 0.13):
   - One `AudioContext`. Each bed is an `AudioBufferSourceNode` (`loop = true`, using the manifest's loop points) → a per-bed `GainNode` → a master `GainNode` → a ducking `GainNode` → destination.
   - Fades use `linearRampToValueAtTime`/`setTargetAtTime` on the gain `AudioParam`s. Cache decoded buffers (LRU, max 4).
   - Resolve categories to assets via `src/audio/ambience-pack.ts` (another worker is writing it concurrently; import `resolveBed` from where that brief puts it, `src/core/playback/resolve-bed.ts`, and if it doesn't exist yet, code against the signature `resolveBed(categoryId: string): {id: string, asset: number} | null` and note it).
   - Read the installed typings in `node_modules/react-native-audio-api/lib/typescript` and use only real APIs.
5. `lectio-engine.ts`: composes voice + mixer. It subscribes to voice position, derives the sentence via the timeline, runs `planBeds`/`diffBeds`, applies the ducking envelope on play/pause, and forwards everything to listeners.
6. `src/features/player/player-store.ts`: a zustand store wrapping the engine (`nowPlaying`, `state`, `positionMs`, `sentenceIdx`, `rate`, `sleepTimer: {mode: 'off'|'minutes'|'endOfChapter', endsAt}`). Sleep timer: fade the master out over 10 s, then pause. It persists the listening position (debounced 5 s plus on pause/background) via an injected `savePosition(point)` callback. Do not import the DB directly; F0 wires it.
7. Tests:
   - `lectio-engine` with mocked voice/mixer modules, plus the fake engine
   - the sleep timer
   - position persistence debounce
   - the remote-command mapping

## Constraints
- Do not run `npm install` (`expo-audio` 57.0.5 and `react-native-audio-api` 0.13.6 are installed, and the config plugins are set). Do not commit.
- Only touch `src/audio/**` (except `ambience-pack.ts`, which is owned by A1), `src/core/playback/**` (except `resolve-bed.ts`, owned by A1) and `src/features/player/player-store.ts` (+ test).
- Native behaviour can't be run here. Be precise with real typings and list every assumption that needs the device spike S1.

## Acceptance
`npm run typecheck`, `npm run lint`, `npm test` and `npm run bundle:check` pass (paste the tails). Include the list of S1 device checks your implementation depends on.
