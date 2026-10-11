import type { Unsubscribe } from './engine';

/** A narration file as the voice needs it. */
export interface VoiceSegment {
  uri: string;
  durationMs: number;
}

export interface VoiceMetadata {
  title: string;
  seriesTitle: string;
  coverUri: string | null;
}

/** One reading of the voice, sent about every 250 ms and on every change. */
export interface VoiceSnapshot {
  /** Media time across all segments. */
  positionMs: number;
  playing: boolean;
  buffering: boolean;
  /** True when the queue has run out. The engine decides between ended and buffering. */
  ended: boolean;
  /** False until the current segment is ready to play. */
  loaded: boolean;
  error: string | null;
}

/**
 * The narration player as the engine sees it. The expo-audio implementation is in voice-player.ts;
 * the fake is in fake-engine.ts. Keeping this port small means the engine logic is tested without
 * native code.
 */
export interface VoicePort {
  load(segments: readonly VoiceSegment[], startMs: number, metadata: VoiceMetadata): Promise<void>;
  append(segments: readonly VoiceSegment[]): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): Promise<void>;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  onSnapshot(callback: (snapshot: VoiceSnapshot) => void): Unsubscribe;
  dispose(): void;
}
