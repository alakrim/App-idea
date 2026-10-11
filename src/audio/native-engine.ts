import { AudioContext, AudioManager } from 'react-native-audio-api';

import { type ResolveBed, createAmbienceMixer } from './ambience-mixer';
import type { AudioEngine } from './engine';
import {
  type InterruptionEvent,
  createLectioEngine,
  type PlatformEventSource,
} from './lectio-engine';
import type { RemoteEvent } from '@/core/playback/remote-commands';
import { createVoicePlayer } from './voice-player';

/**
 * Phone calls and other focus losses, from react-native-audio-api's session observer. The
 * observer starts on the first subscribe, not at import time, so tests never touch native code.
 */
const nativeInterruptions: PlatformEventSource<InterruptionEvent> = {
  subscribe(callback) {
    AudioManager.observeAudioInterruptions(true);
    const subscription = AudioManager.addSystemEventListener('interruption', (event) => {
      callback({ type: event.type, shouldResume: event.shouldResume });
    });
    return () => {
      subscription?.remove();
    };
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
  resolveBed: ResolveBed;
}

/**
 * The production engine: expo-audio for the narration and react-native-audio-api for the beds.
 * Nothing native is created until the first call to load() or to the mixer.
 */
export function createNativeAudioEngine(options: NativeEngineOptions): AudioEngine {
  return createLectioEngine({
    voice: createVoicePlayer(),
    mixer: createAmbienceMixer({
      resolveBed: options.resolveBed,
      createContext: () => new AudioContext(),
    }),
    interruptions: nativeInterruptions,
    remote: noRemoteEvents,
  });
}
