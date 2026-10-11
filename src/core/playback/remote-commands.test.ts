import { type RemoteCommandState, toRemoteCommand } from './remote-commands';

const state: RemoteCommandState = { playing: false, positionMs: 10_000, durationMs: 60_000 };

describe('toRemoteCommand', () => {
  it('maps transport events one to one', () => {
    expect(toRemoteCommand({ name: 'play' }, state)).toEqual({ type: 'play' });
    expect(toRemoteCommand({ name: 'pause' }, state)).toEqual({ type: 'pause' });
    expect(toRemoteCommand({ name: 'next' }, state)).toEqual({ type: 'next' });
    expect(toRemoteCommand({ name: 'previous' }, state)).toEqual({ type: 'prev' });
  });

  it('toggles against the current playing state', () => {
    expect(toRemoteCommand({ name: 'togglePlayPause' }, { ...state, playing: true })).toEqual({
      type: 'pause',
    });
    expect(toRemoteCommand({ name: 'togglePlayPause' }, { ...state, playing: false })).toEqual({
      type: 'play',
    });
  });

  it('seeks to an absolute position, clamped to the chapter', () => {
    expect(toRemoteCommand({ name: 'seekTo', positionMs: 30_000 }, state)).toEqual({
      type: 'seek',
      positionMs: 30_000,
    });
    expect(toRemoteCommand({ name: 'seekTo', positionMs: 900_000 }, state)).toEqual({
      type: 'seek',
      positionMs: 60_000,
    });
    expect(toRemoteCommand({ name: 'seekTo', positionMs: -5 }, state)).toEqual({
      type: 'seek',
      positionMs: 0,
    });
  });

  it('skips relative to the current position and clamps at both ends', () => {
    expect(toRemoteCommand({ name: 'skipForward', seconds: 15 }, state)).toEqual({
      type: 'seek',
      positionMs: 25_000,
    });
    expect(toRemoteCommand({ name: 'skipBackward', seconds: 15 }, state)).toEqual({
      type: 'seek',
      positionMs: 0,
    });
    expect(
      toRemoteCommand({ name: 'skipForward', seconds: 120 }, { ...state, positionMs: 50_000 }),
    ).toEqual({ type: 'seek', positionMs: 60_000 });
  });
});
