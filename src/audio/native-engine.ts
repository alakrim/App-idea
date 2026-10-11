import { AudioContext } from 'react-native-audio-api';

import type { RemoteEvent } from '@/core/playback/remote-commands';

import { type ResolveBed, createAmbienceMixer } from './ambience-mixer';
import { resolveInstalledBed } from './ambience-pack';
import {
  type InterruptionEvent,
  createLectioEngine,
  type PlatformEventSource,
} from './lectio-engine';
import { createVoicePlayer } from './voice-player';

import type { AudioEngine } from './engine';

/**
 * Phone calls and other focus losses are handled by expo-audio itself, so the engine listens to
 * nothing here. expo-audio owns audio focus for the whole app: it pauses the narration when focus is
 * lost and resumes it after a transient loss, and the engine follows through the voice snapshots.
 *
 * Do not subscribe through react-native-audio-api's `AudioManager.observeAudioInterruptions`. On
 * Android that call requests audio focus for a second client inside this app. The two clients then
 * take focus from each other on every play: each narration play() made react-native-audio-api
 * report an interruption, the engine paused the voice, expo-audio released focus, the other client
 * reported the interruption over with "resume", and the engine played again. The narration stopped
 * and started in a loop, like a scratched CD (incident 3 in docs/STATE.md).
 */
const noInterruptions: PlatformEventSource<InterruptionEvent> = {
  subscribe() {
    return () => undefined;
  },
};

/**
 * Lock-screen transport events are not in the expo-audio 57.0.5 typings. The native Media3
 * session drives play and pause on the player directly. Until S1 confirms next, previous and
 * seek delivery, this source is silent. See the S1 checklist in the report.
 */
const noRemoteEvents: PlatformEventSource<RemoteEvent> = {
  subscribe() {
    return () => undefined;
  },
};

export interface NativeEngineOptions {
  /** Maps an ambience category to an installed bed. Defaults to the bundled base pack. */
  resolveBed?: ResolveBed;
}

/** The bundled base pack, with each bed's manifest loudness attached. */
const resolveBundledBed: ResolveBed = (categoryId) => {
  const bed = resolveInstalledBed(categoryId);
  return bed
    ? {
        id: bed.id,
        asset: bed.asset,
        lufs: bed.meta.lufs,
        loopStartMs: bed.meta.loopStartMs,
        loopEndMs: bed.meta.loopEndMs,
      }
    : null;
};

/**
 * The production engine: expo-audio for the narration and react-native-audio-api for the beds.
 * Nothing native is created until the first call to load() or to the mixer.
 */
export function createNativeAudioEngine(options: NativeEngineOptions = {}): AudioEngine {
  const resolveBed = options.resolveBed ?? resolveBundledBed;
  return createLectioEngine({
    voice: createVoicePlayer(),
    mixer: createAmbienceMixer({
      resolveBed,
      createContext: () => new AudioContext(),
    }),
    interruptions: noInterruptions,
    remote: noRemoteEvents,
    bedLufs: (category) => resolveBed(category)?.lufs ?? null,
  });
}
