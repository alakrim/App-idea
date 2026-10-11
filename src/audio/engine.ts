import type { AmbienceCue } from '@/core/domain/analysis';
import type { BedCommand } from '@/core/playback/ambience-scheduler';
import type { RemoteCommand } from '@/core/playback/remote-commands';
import type { TimelineSegment } from '@/core/playback/timeline';

/** Everything features may observe about playback. `error` is terminal until the next load. */
export type PlaybackState =
  'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

/** A narration file plus its sentence timing. Offsets are relative to the segment start. */
export interface LoadedSegment extends TimelineSegment {
  uri: string;
}

export interface ChapterLoad {
  id: string;
  /** Chapter order within the series. Carried through to the position saver. */
  order: number;
  title: string;
  seriesTitle: string;
  coverUri: string | null;
  /** Contiguous segments starting at sentence 0. More can follow through appendSegments. */
  segments: readonly LoadedSegment[];
  /** False while narration is still being generated. The engine buffers at the end, not ends. */
  final: boolean;
  cues: readonly AmbienceCue[];
}

export interface PositionUpdate {
  /** Media time: unaffected by playback rate. */
  positionMs: number;
  /** -1 when no sentence is available yet. */
  sentenceIdx: number;
}

export type Unsubscribe = () => void;

/**
 * The playback engine as features see it. Implementations: the native engine (expo-audio voice,
 * react-native-audio-api ambience) and the fake, which runs on a virtual clock.
 */
export interface AudioEngine {
  /** Replaces the current chapter. Resolves once the voice has the first segment ready. */
  load(chapter: ChapterLoad, startMs: number): Promise<void>;
  play(): void;
  pause(): void;
  /** Seeks in media time. Positions past the available audio clamp to the last available moment. */
  seekTo(ms: number): void;
  /** Playback rate in 0.5 to 2. Pitch is preserved. Throws RangeError outside that range. */
  setRate(rate: number): void;
  /** Voice output volume in 0 to 1. The sleep timer uses it for the fade-out. */
  setVolume(volume: number): void;
  /** Adds segments for progressive playback. `final` marks the last one. */
  appendSegments(segments: readonly LoadedSegment[], final: boolean): void;
  /**
   * Applies bed commands to the mixer. The engine normally drives this itself from sentence
   * changes. Callers outside the engine (for example a preview) should not mix with it.
   */
  setAmbience(commands: readonly BedCommand[]): void;
  /** Turns the ambience master on or off, and sets the base bed level in dB (-40 to 0). */
  setAmbienceMaster(enabled: boolean, levelDb: number): void;
  /** About 4 Hz while playing, plus on every sentence change and seek. */
  onPosition(callback: (update: PositionUpdate) => void): Unsubscribe;
  onState(callback: (state: PlaybackState) => void): Unsubscribe;
  /** Lock-screen and headset commands. play, pause and seek are also applied by the engine. */
  onRemoteCommand(callback: (command: RemoteCommand) => void): Unsubscribe;
  dispose(): void;
}
