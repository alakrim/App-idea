/**
 * Raw transport events from the lock screen, notification or headset. Names follow the common
 * media-session vocabulary so each native source can map onto them.
 */
export type RemoteEvent =
  | { name: 'play' }
  | { name: 'pause' }
  | { name: 'togglePlayPause' }
  | { name: 'next' }
  | { name: 'previous' }
  | { name: 'seekTo'; positionMs: number }
  | { name: 'skipForward'; seconds: number }
  | { name: 'skipBackward'; seconds: number };

/** Commands the engine understands. Next and previous are handled by the chapter navigation. */
export type RemoteCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; positionMs: number };

export interface RemoteCommandState {
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

function clampMs(ms: number, durationMs: number): number {
  return Math.min(Math.max(0, ms), Math.max(0, durationMs));
}

/**
 * Maps a raw transport event to an engine command. Toggle resolves against the current playing
 * state. Relative skips and absolute seeks are clamped to the chapter.
 */
export function toRemoteCommand(event: RemoteEvent, state: RemoteCommandState): RemoteCommand {
  switch (event.name) {
    case 'play':
      return { type: 'play' };
    case 'pause':
      return { type: 'pause' };
    case 'togglePlayPause':
      return { type: state.playing ? 'pause' : 'play' };
    case 'next':
      return { type: 'next' };
    case 'previous':
      return { type: 'prev' };
    case 'seekTo':
      return { type: 'seek', positionMs: clampMs(event.positionMs, state.durationMs) };
    case 'skipForward':
      return {
        type: 'seek',
        positionMs: clampMs(state.positionMs + event.seconds * 1000, state.durationMs),
      };
    case 'skipBackward':
      return {
        type: 'seek',
        positionMs: clampMs(state.positionMs - event.seconds * 1000, state.durationMs),
      };
  }
}
