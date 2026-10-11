import type { BedCommand } from '@/core/playback/ambience-scheduler';
import type { DuckRamp } from '@/core/playback/ducking';
import type { RemoteEvent } from '@/core/playback/remote-commands';

import {
  type InterruptionEvent,
  createLectioEngine,
  type PlatformEventSource,
} from './lectio-engine';

import type { AmbienceMixer } from './ambience-mixer';
import type { AudioEngine } from './engine';
import type { VoicePort, VoiceSegment, VoiceSnapshot } from './voice-port';

/** Snapshot cadence of the virtual voice, matching the native player's 250 ms update interval. */
const TICK_MS = 250;

export interface FakeAudioEngine extends AudioEngine {
  /** Moves the virtual clock. A playing voice advances at the current rate, and the engine reacts. */
  advance(ms: number): void;
  /** Every bed command the engine sent to the mixer, in order. */
  readonly ambienceCommands: readonly BedCommand[];
  /** Cue ids the mixer currently has sounding, by replaying the commands. */
  soundingBedIds(): string[];
  /** The last ducking ramp sent to the mixer. */
  readonly duckRamps: readonly DuckRamp[];
  /** The voice volume the engine last applied, from 0 to 1. */
  readonly voiceVolume: number;
  emitRemote(event: RemoteEvent): void;
  emitInterruption(event: InterruptionEvent): void;
}

function createEmitter<Event>(): PlatformEventSource<Event> & { emit(event: Event): void } {
  const listeners = new Set<(event: Event) => void>();
  return {
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    emit(event) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

interface VirtualVoice extends VoicePort {
  advance(ms: number): void;
  readonly currentVolume: number;
}

/** A voice that moves only when told to. Segments play back to back, like the native swap. */
function createVirtualVoice(): VirtualVoice {
  let segments: VoiceSegment[] = [];
  let position = 0;
  let rate = 1;
  let volume = 1;
  let wantPlaying = false;
  let playing = false;
  let ended = false;
  const listeners = new Set<(snapshot: VoiceSnapshot) => void>();

  const total = () => segments.reduce((sum, segment) => sum + segment.durationMs, 0);

  const snapshot = (): VoiceSnapshot => ({
    positionMs: position,
    playing,
    buffering: false,
    ended,
    loaded: true,
    error: null,
  });
  const emit = () => {
    for (const listener of [...listeners]) listener(snapshot());
  };

  return {
    async load(next, startMs) {
      segments = [...next];
      position = Math.min(Math.max(0, startMs), total());
      ended = false;
      playing = false;
      emit();
    },
    append(more) {
      segments = [...segments, ...more];
      if (ended && more.length > 0) {
        ended = false;
        playing = wantPlaying;
        emit();
      }
    },
    play() {
      wantPlaying = true;
      if (!ended) playing = true;
      emit();
    },
    pause() {
      wantPlaying = false;
      playing = false;
      emit();
    },
    async seekTo(ms) {
      position = Math.min(Math.max(0, ms), total());
      ended = false;
      playing = wantPlaying;
      emit();
    },
    setRate(next) {
      rate = next;
    },
    setVolume(next) {
      volume = next;
    },
    get currentVolume() {
      return volume;
    },
    onSnapshot(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    advance(ms) {
      let remaining = ms;
      while (remaining > 0) {
        const step = Math.min(TICK_MS, remaining);
        remaining -= step;
        if (playing) {
          position += step * rate;
          if (position >= total()) {
            position = total();
            playing = false;
            ended = true;
          }
        }
        emit();
      }
    },
    dispose() {
      listeners.clear();
      segments = [];
    },
  };
}

/** Records commands and ramps instead of making sound. */
function createRecordingMixer(): AmbienceMixer & {
  commands: BedCommand[];
  ramps: DuckRamp[];
  sounding(): string[];
} {
  const commands: BedCommand[] = [];
  const ramps: DuckRamp[] = [];
  const sounding = new Set<string>();
  return {
    commands,
    ramps,
    sounding: () => [...sounding].sort(),
    apply(next) {
      for (const command of next) {
        commands.push(command);
        if (command.type === 'start') sounding.add(command.cueId);
        if (command.type === 'stop') sounding.delete(command.cueId);
      }
    },
    setMaster() {
      // The recorder has no master gain to track.
    },
    setDucking(ramp) {
      ramps.push(ramp);
    },
    dispose() {
      sounding.clear();
    },
  };
}

/**
 * Deterministic engine for feature tests. It runs the real lectio-engine on a virtual voice and a
 * recording mixer, so scheduling and state logic behave as they do on device. Nothing advances
 * unless `advance()` is called.
 */
export function createFakeEngine(): FakeAudioEngine {
  const voice = createVirtualVoice();
  const mixer = createRecordingMixer();
  const interruptions = createEmitter<InterruptionEvent>();
  const remote = createEmitter<RemoteEvent>();
  const engine = createLectioEngine({ voice, mixer, interruptions, remote });

  // Object spread would evaluate the getters once, at construction, so the readbacks would freeze.
  // Assigning the engine's methods onto an object that already has the accessors keeps them live.
  const fake = {
    advance: (ms: number) => voice.advance(ms),
    get ambienceCommands() {
      return mixer.commands;
    },
    soundingBedIds: () => mixer.sounding(),
    get duckRamps() {
      return mixer.ramps;
    },
    get voiceVolume() {
      return voice.currentVolume;
    },
    emitRemote: (event: RemoteEvent) => remote.emit(event),
    emitInterruption: (event: InterruptionEvent) => interruptions.emit(event),
  };
  return Object.assign(fake, engine);
}
