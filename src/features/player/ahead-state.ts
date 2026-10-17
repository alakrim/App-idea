/*
 * "Narrating ahead" (ADR-0008): playback reached the end of the audio made so far while the chapter
 * is still being narrated. It is a calm wait, not an error. The engine reports it as buffering at the
 * end of a chapter that is not final, and the voice resumes by itself when the next segment lands.
 */
import type { PlaybackState } from '@/audio/engine';

export const NARRATING_AHEAD_COPY = 'Narrating ahead…';

/** Position updates arrive about 4 times a second, so the end can be read this many ms early. */
export const AHEAD_TOLERANCE_MS = 750;

export interface AheadInput {
  readonly playState: PlaybackState;
  /** False while the chapter is still being narrated. */
  readonly final: boolean;
  readonly positionMs: number;
  /** The length of the audio made so far. */
  readonly generatedMs: number;
}

export function isNarratingAhead({
  playState,
  final,
  positionMs,
  generatedMs,
}: AheadInput): boolean {
  return (
    !final &&
    generatedMs > 0 &&
    playState === 'buffering' &&
    positionMs >= generatedMs - AHEAD_TOLERANCE_MS
  );
}
