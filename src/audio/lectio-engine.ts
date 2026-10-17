import type { AmbienceCue } from '@/core/domain/analysis';
import {
  type BedTarget,
  bedGainDb,
  DEFAULT_BED_LEVEL_DB,
  diffBeds,
  planBeds,
} from '@/core/playback/ambience-scheduler';
import { DUCKING_DEFAULTS, duckEnvelope } from '@/core/playback/ducking';
import { BED_LEVEL_RANGE_DB, DUCKING_RANGE_DB, isInRange } from '@/core/playback/ranges';
import {
  type RemoteCommand,
  type RemoteEvent,
  toRemoteCommand,
} from '@/core/playback/remote-commands';
import { buildTimeline, type ChapterTimeline } from '@/core/playback/timeline';
import { systemTimers, type TimerPort } from '@/core/playback/timers';

import type { AmbienceMixer } from './ambience-mixer';
import type {
  AmbienceMix,
  AudioEngine,
  ChapterLoad,
  LoadedSegment,
  PlaybackState,
  PositionUpdate,
  Unsubscribe,
} from './engine';
import type { VoicePort, VoiceSegment, VoiceSnapshot } from './voice-port';

/** A platform event feed. `subscribe` returns the function that stops it. */
export interface PlatformEventSource<Event> {
  subscribe(callback: (event: Event) => void): Unsubscribe;
}

export interface LectioEngineDeps {
  voice: VoicePort;
  mixer: AmbienceMixer;
  remote: PlatformEventSource<RemoteEvent>;
  /** Loudness of the bed a category resolves to. Omitted means every bed is the target loudness. */
  bedLufs?: (category: string) => number | null;
  /** Schedules the bed fades. Tests drive it with a virtual clock. */
  timers?: TimerPort;
}

/**
 * Beds fade out this long after the voice stops, so a segment swap or a short buffer does not
 * flicker them (P1-2). Resuming inside the delay keeps them sounding.
 */
export const BED_STOP_DELAY_MS = 350;
/** The fade a bed takes when the voice stops, pauses, fails or leaves the chapter. */
export const BED_FADE_OUT_MS = 600;
/** The audio clock is suspended this long after the beds have faded, so an idle player holds no stream. */
export const BED_SUSPEND_DELAY_MS = 2000;

interface LoadedChapter {
  id: string;
  title: string;
  seriesTitle: string;
  coverUri: string | null;
  segments: LoadedSegment[];
  final: boolean;
}

/** The cue a preview plays on. Chapter cues are ids from the analysis, so this never collides. */
const PREVIEW_CUE_ID = 'preview';
const PREVIEW_FADE_MS = 400;
const PREVIEW_INTENSITY = 'medium';

const MIN_RATE = 0.5;
const MAX_RATE = 2;

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

const DEFAULT_MIX: AmbienceMix = {
  enabled: true,
  levelDb: DEFAULT_BED_LEVEL_DB,
  duckingDb: DUCKING_DEFAULTS.duckingDb,
};

/**
 * Composes the voice and the ambience mixer into one AudioEngine. The voice drives everything.
 * Each snapshot updates the state, position and sentence. Beds follow the transport: they sound
 * while the voice plays or buffers, and fade out after a short delay when it stops. The ducking
 * stage dips the beds only while the voice plays, and it holds until the beds have faded, so a
 * pause never makes them louder.
 */
export function createLectioEngine(deps: LectioEngineDeps): AudioEngine {
  const { voice, mixer } = deps;
  const timers = deps.timers ?? systemTimers;
  let chapter: LoadedChapter | null = null;
  let timeline: ChapterTimeline | null = null;
  let cues: AmbienceCue[] = [];
  let state: PlaybackState = 'idle';
  let positionMs = 0;
  let sentenceIdx = -1;
  let mix: AmbienceMix = DEFAULT_MIX;
  /** The beds the current sentence wants. */
  let desired: BedTarget[] = [];
  /** The beds the mixer is playing, or fading out. */
  let applied: BedTarget[] = [];
  let stopTimer: unknown = null;
  let fadeTimer: unknown = null;
  let suspendTimer: unknown = null;
  /** True from the moment beds start fading out until the fade ends. */
  let duckHeld = false;
  let ducked = false;
  let previewTimer: unknown = null;
  let loadSeq = 0;
  let lastSnapshot: VoiceSnapshot | null = null;
  let disposed = false;

  const positionListeners = new Set<(update: PositionUpdate) => void>();
  const stateListeners = new Set<(next: PlaybackState) => void>();
  const remoteListeners = new Set<(command: RemoteCommand) => void>();

  const unsubscribeVoice = voice.onSnapshot(handleSnapshot);
  const unsubscribeRemote = deps.remote.subscribe(handleRemote);

  function cancel(handle: unknown): void {
    if (handle !== null) timers.clearTimeout(handle);
  }

  function bedsWanted(): boolean {
    return chapter !== null && mix.enabled && (state === 'playing' || state === 'buffering');
  }

  function updateDucking(force = false): void {
    const engaged = state === 'playing' || duckHeld;
    if (engaged === ducked && !force) return;
    ducked = engaged;
    mixer.setDucking(
      duckEnvelope({
        duckingDb: mix.duckingDb,
        attackMs: DUCKING_DEFAULTS.attackMs,
        releaseMs: DUCKING_DEFAULTS.releaseMs,
        voiceActive: engaged,
      }),
    );
  }

  /** Moves the mixer to the planned beds, while the transport wants them. Only the difference is sent. */
  function syncBeds(): void {
    if (!bedsWanted()) return;
    const commands = diffBeds(applied, desired);
    applied = desired;
    if (commands.length > 0) mixer.apply(commands);
  }

  /** Fades every bed out. The ducking holds until the fade is over, then the clock is suspended. */
  function stopBeds(): void {
    cancel(stopTimer);
    stopTimer = null;
    if (applied.length === 0) return;
    mixer.apply(
      applied.map((bed) => ({ type: 'stop', cueId: bed.cueId, fadeMs: BED_FADE_OUT_MS })),
    );
    applied = [];
    duckHeld = true;
    updateDucking();
    cancel(fadeTimer);
    fadeTimer = timers.setTimeout(() => {
      fadeTimer = null;
      duckHeld = false;
      updateDucking();
      suspendTimer = timers.setTimeout(() => {
        suspendTimer = null;
        mixer.suspend();
      }, BED_SUSPEND_DELAY_MS);
    }, BED_FADE_OUT_MS);
  }

  function onTransportChanged(): void {
    if (bedsWanted()) {
      cancel(stopTimer);
      stopTimer = null;
      cancel(fadeTimer);
      fadeTimer = null;
      cancel(suspendTimer);
      suspendTimer = null;
      duckHeld = false;
      updateDucking();
      syncBeds();
      return;
    }
    if (!mix.enabled) {
      stopBeds();
      updateDucking();
      return;
    }
    if (applied.length > 0 && stopTimer === null) {
      duckHeld = true;
      stopTimer = timers.setTimeout(stopBeds, BED_STOP_DELAY_MS);
    }
    updateDucking();
  }

  function setState(next: PlaybackState): void {
    if (next === state) return;
    state = next;
    onTransportChanged();
    for (const listener of stateListeners) listener(next);
  }

  function emitPosition(): void {
    const update: PositionUpdate = { positionMs, sentenceIdx };
    for (const listener of positionListeners) listener(update);
  }

  /** Plans the beds for a sentence and, while the transport wants them, sounds the plan. */
  function planAt(idx: number): void {
    sentenceIdx = idx;
    desired = idx < 0 ? [] : planBeds(cues, idx, { levelDb: mix.levelDb, bedLufs: deps.bedLufs });
    syncBeds();
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
      const seq = ++loadSeq;
      // The previous chapter's beds fade out now. Its timeline is gone.
      stopBeds();
      desired = [];
      lastSnapshot = null;
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
        if (seq === loadSeq) setState('error');
        throw error;
      }
      // A newer load, or a dispose, has taken over: this chapter's position must not move anything.
      if (seq !== loadSeq || disposed) return;
      moveTo(start);
      planAt(timeline.positionToSentence(positionMs));
      emitPosition();
    },

    play() {
      if (disposed || !chapter) return;
      if (state === 'ended') {
        engine.seekTo(0);
      }
      voice.play();
    },

    pause() {
      if (disposed || !chapter) return;
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

    setVolume(nextVolume: number) {
      if (!(nextVolume >= 0 && nextVolume <= 1)) {
        throw new RangeError(`volume must be between 0 and 1, got ${nextVolume}`);
      }
      voice.setVolume(nextVolume);
      // The beds share the fade, so a sleep timer takes the whole mix down together.
      mixer.setMasterGain(nextVolume);
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

    setAmbienceMix(next: AmbienceMix) {
      if (disposed) return;
      if (!isInRange(next.levelDb, BED_LEVEL_RANGE_DB)) {
        throw new RangeError(
          `levelDb must be between ${BED_LEVEL_RANGE_DB.min} and ${BED_LEVEL_RANGE_DB.max}, got ${next.levelDb}`,
        );
      }
      if (!isInRange(next.duckingDb, DUCKING_RANGE_DB)) {
        throw new RangeError(
          `duckingDb must be between ${DUCKING_RANGE_DB.min} and ${DUCKING_RANGE_DB.max}, got ${next.duckingDb}`,
        );
      }
      mix = { ...next };
      updateDucking(true);
      if (sentenceIdx >= 0) planAt(sentenceIdx);
      if (!mix.enabled) stopBeds();
    },

    setCues(next: readonly AmbienceCue[]) {
      if (disposed || !chapter) return;
      cues = next.filter((cue) => cue.enabled);
      if (sentenceIdx >= 0) planAt(sentenceIdx);
    },

    previewBed(category: string, previewLevelDb: number, durationMs: number) {
      if (disposed) return;
      if (!isInRange(previewLevelDb, BED_LEVEL_RANGE_DB)) {
        throw new RangeError(
          `levelDb must be between ${BED_LEVEL_RANGE_DB.min} and ${BED_LEVEL_RANGE_DB.max}, got ${previewLevelDb}`,
        );
      }
      const gainDb = bedGainDb(
        previewLevelDb,
        PREVIEW_INTENSITY,
        deps.bedLufs?.(category) ?? undefined,
      );
      mixer.apply([
        { type: 'start', cueId: PREVIEW_CUE_ID, category, gainDb, fadeMs: PREVIEW_FADE_MS },
      ]);
      cancel(previewTimer);
      previewTimer = timers.setTimeout(() => {
        previewTimer = null;
        if (!disposed) {
          mixer.apply([{ type: 'stop', cueId: PREVIEW_CUE_ID, fadeMs: PREVIEW_FADE_MS }]);
        }
      }, durationMs);
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
      unsubscribeRemote();
      for (const handle of [stopTimer, fadeTimer, suspendTimer, previewTimer]) cancel(handle);
      stopTimer = null;
      fadeTimer = null;
      suspendTimer = null;
      previewTimer = null;
      voice.dispose();
      mixer.dispose();
      positionListeners.clear();
      stateListeners.clear();
      remoteListeners.clear();
      desired = [];
      applied = [];
      state = 'idle';
    },
  };

  return engine;
}
