import type { AmbienceCue } from '@/core/domain/analysis';
import {
  type BedTarget,
  DEFAULT_BED_LEVEL_DB,
  diffBeds,
  planBeds,
} from '@/core/playback/ambience-scheduler';
import { DUCKING_DEFAULTS, duckEnvelope } from '@/core/playback/ducking';
import { type RemoteCommand, type RemoteEvent, toRemoteCommand } from '@/core/playback/remote-commands';
import { buildTimeline, type ChapterTimeline } from '@/core/playback/timeline';

import type { AmbienceMixer } from './ambience-mixer';
import type {
  AudioEngine,
  ChapterLoad,
  LoadedSegment,
  PlaybackState,
  PositionUpdate,
  Unsubscribe,
} from './engine';
import type { VoicePort, VoiceSegment, VoiceSnapshot } from './voice-port';

export interface InterruptionEvent {
  type: 'began' | 'ended';
  /** Set by the OS on `ended`. Resume only when it is true. */
  shouldResume: boolean;
}

/** A platform event feed. `subscribe` returns the function that stops it. */
export interface PlatformEventSource<Event> {
  subscribe(callback: (event: Event) => void): Unsubscribe;
}

export interface LectioEngineDeps {
  voice: VoicePort;
  mixer: AmbienceMixer;
  interruptions: PlatformEventSource<InterruptionEvent>;
  remote: PlatformEventSource<RemoteEvent>;
}

interface LoadedChapter {
  id: string;
  title: string;
  seriesTitle: string;
  coverUri: string | null;
  segments: LoadedSegment[];
  final: boolean;
}

const MIN_RATE = 0.5;
const MAX_RATE = 2;
const MIN_LEVEL_DB = -40;
const MAX_LEVEL_DB = 0;

function toVoiceSegment(segment: LoadedSegment): VoiceSegment {
  return { uri: segment.uri, durationMs: segment.durationMs };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

/**
 * Derives the public state from one voice snapshot. Running out of audio before the last segment
 * exists is buffering, not the end of the chapter.
 */
function deriveState(snapshot: VoiceSnapshot, final: boolean): PlaybackState {
  if (snapshot.error !== null) return 'error';
  if (snapshot.ended) return final ? 'ended' : 'buffering';
  if (!snapshot.loaded) return 'loading';
  if (snapshot.buffering) return 'buffering';
  return snapshot.playing ? 'playing' : 'paused';
}

/**
 * Composes the voice and the ambience mixer into one AudioEngine. The voice drives everything.
 * Each snapshot updates the state, position and sentence. A sentence change re-plans the beds, and
 * the ducking ramp follows whether the voice is actively playing.
 */
export function createLectioEngine(deps: LectioEngineDeps): AudioEngine {
  const { voice, mixer } = deps;
  let chapter: LoadedChapter | null = null;
  let timeline: ChapterTimeline | null = null;
  let cues: AmbienceCue[] = [];
  let state: PlaybackState = 'idle';
  let positionMs = 0;
  let sentenceIdx = -1;
  let beds: BedTarget[] = [];
  let levelDb = DEFAULT_BED_LEVEL_DB;
  let ducked = false;
  let interruptedWhilePlaying = false;
  let lastSnapshot: VoiceSnapshot | null = null;
  let disposed = false;

  const positionListeners = new Set<(update: PositionUpdate) => void>();
  const stateListeners = new Set<(next: PlaybackState) => void>();
  const remoteListeners = new Set<(command: RemoteCommand) => void>();

  const unsubscribeVoice = voice.onSnapshot(handleSnapshot);
  const unsubscribeInterruptions = deps.interruptions.subscribe(handleInterruption);
  const unsubscribeRemote = deps.remote.subscribe(handleRemote);

  function setState(next: PlaybackState): void {
    if (next === state) return;
    state = next;
    const voiceActive = next === 'playing';
    if (voiceActive !== ducked) {
      ducked = voiceActive;
      mixer.setDucking(duckEnvelope({ ...DUCKING_DEFAULTS, voiceActive }));
    }
    for (const listener of stateListeners) listener(next);
  }

  function emitPosition(): void {
    const update: PositionUpdate = { positionMs, sentenceIdx };
    for (const listener of positionListeners) listener(update);
  }

  /** Re-plans beds for a sentence. Commands are applied only for the difference. */
  function planAt(idx: number): void {
    sentenceIdx = idx;
    if (idx < 0) return;
    const next = planBeds(cues, idx, levelDb);
    const commands = diffBeds(beds, next);
    beds = next;
    if (commands.length > 0) mixer.apply(commands);
  }

  function moveTo(ms: number): void {
    if (!timeline) return;
    positionMs = clamp(ms, 0, timeline.totalDurationMs);
    const idx = timeline.positionToSentence(positionMs);
    if (idx !== sentenceIdx) planAt(idx);
  }

  function handleSnapshot(snapshot: VoiceSnapshot): void {
    if (disposed || !chapter) return;
    lastSnapshot = snapshot;
    if (timeline) {
      moveTo(snapshot.positionMs);
    }
    setState(deriveState(snapshot, chapter.final));
    emitPosition();
  }

  function handleInterruption(event: InterruptionEvent): void {
    if (disposed || !chapter) return;
    if (event.type === 'began') {
      if (state === 'playing') {
        interruptedWhilePlaying = true;
        voice.pause();
      }
      return;
    }
    if (interruptedWhilePlaying) {
      interruptedWhilePlaying = false;
      if (event.shouldResume) voice.play();
    }
  }

  function handleRemote(event: RemoteEvent): void {
    if (disposed || !chapter) return;
    const command = toRemoteCommand(event, {
      playing: state === 'playing',
      positionMs,
      durationMs: timeline?.totalDurationMs ?? 0,
    });
    if (command.type === 'play') engine.play();
    else if (command.type === 'pause') engine.pause();
    else if (command.type === 'seek') engine.seekTo(command.positionMs);
    for (const listener of remoteListeners) listener(command);
  }

  const engine: AudioEngine = {
    async load(next: ChapterLoad, startMs: number): Promise<void> {
      if (disposed) throw new Error('the audio engine has been disposed');
      const built = buildTimeline(next.segments);
      interruptedWhilePlaying = false;
      lastSnapshot = null;
      if (beds.length > 0) mixer.apply(diffBeds(beds, []));
      beds = [];
      sentenceIdx = -1;
      cues = next.cues.filter((cue) => cue.enabled);
      chapter = {
        id: next.id,
        title: next.title,
        seriesTitle: next.seriesTitle,
        coverUri: next.coverUri,
        segments: [...next.segments],
        final: next.final,
      };
      timeline = built;
      setState('loading');
      const start = clamp(startMs, 0, built.totalDurationMs);
      try {
        await voice.load(chapter.segments.map(toVoiceSegment), start, {
          title: next.title,
          seriesTitle: next.seriesTitle,
          coverUri: next.coverUri,
        });
      } catch (error) {
        setState('error');
        throw error;
      }
      moveTo(start);
      planAt(timeline.positionToSentence(positionMs));
      emitPosition();
    },

    play() {
      if (disposed || !chapter) return;
      if (state === 'ended') {
        engine.seekTo(0);
      }
      interruptedWhilePlaying = false;
      voice.play();
    },

    pause() {
      if (disposed || !chapter) return;
      interruptedWhilePlaying = false;
      voice.pause();
    },

    seekTo(ms: number) {
      if (disposed || !chapter || !timeline) return;
      moveTo(ms);
      voice.seekTo(positionMs).catch(() => {
        setState('error');
      });
      emitPosition();
    },

    setRate(rate: number) {
      if (!(rate >= MIN_RATE && rate <= MAX_RATE)) {
        throw new RangeError(`rate must be between ${MIN_RATE} and ${MAX_RATE}, got ${rate}`);
      }
      voice.setRate(rate);
    },

    setVolume(volume: number) {
      if (!(volume >= 0 && volume <= 1)) {
        throw new RangeError(`volume must be between 0 and 1, got ${volume}`);
      }
      voice.setVolume(volume);
    },

    appendSegments(segments: readonly LoadedSegment[], final: boolean) {
      if (disposed || !chapter) throw new Error('no chapter is loaded');
      const merged = [...chapter.segments, ...segments];
      timeline = buildTimeline(merged);
      chapter.segments = merged;
      chapter.final = final;
      voice.append(segments.map(toVoiceSegment));
      if (lastSnapshot) handleSnapshot(lastSnapshot);
    },

    setAmbience(commands) {
      if (disposed) return;
      mixer.apply(commands);
    },

    setAmbienceMaster(enabled: boolean, nextLevelDb: number) {
      if (!(nextLevelDb >= MIN_LEVEL_DB && nextLevelDb <= MAX_LEVEL_DB)) {
        throw new RangeError(
          `levelDb must be between ${MIN_LEVEL_DB} and ${MAX_LEVEL_DB}, got ${nextLevelDb}`,
        );
      }
      levelDb = nextLevelDb;
      mixer.setMaster(enabled);
      if (chapter && sentenceIdx >= 0) planAt(sentenceIdx);
    },

    onPosition(callback) {
      positionListeners.add(callback);
      return () => {
        positionListeners.delete(callback);
      };
    },

    onState(callback) {
      stateListeners.add(callback);
      return () => {
        stateListeners.delete(callback);
      };
    },

    onRemoteCommand(callback) {
      remoteListeners.add(callback);
      return () => {
        remoteListeners.delete(callback);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeVoice();
      unsubscribeInterruptions();
      unsubscribeRemote();
      voice.dispose();
      mixer.dispose();
      positionListeners.clear();
      stateListeners.clear();
      remoteListeners.clear();
      beds = [];
      state = 'idle';
    },
  };

  return engine;
}
