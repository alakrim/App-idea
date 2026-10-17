/*
 * A fake of the expo-audio calls the voice player makes. Tests install it with
 * `jest.mock('expo-audio', () => require('./__fixtures__/expo-audio-fake').fakeExpoAudio())`, then
 * read `mockPlayers` to drive each player's status listener. Each test resets it in beforeEach.
 */

export type StatusListener = (status: Record<string, unknown>) => void;

export interface MockPlayer {
  listener: StatusListener | null;
  play: jest.Mock;
  pause: jest.Mock;
  replace: jest.Mock;
  seekTo: jest.Mock;
  setPlaybackRate: jest.Mock;
  setActiveForLockScreen: jest.Mock;
  clearLockScreenControls: jest.Mock;
  remove: jest.Mock;
  volume: number;
}

export const mockPlayers: MockPlayer[] = [];
/** Resolvers for each pending setAudioModeAsync call, oldest first. */
export const mockAudioModeResolvers: (() => void)[] = [];

export function resetExpoAudioFake(): void {
  mockPlayers.length = 0;
  mockAudioModeResolvers.length = 0;
}

/** Lets the audio mode of the oldest pending load resolve. */
export function releaseAudioMode(): void {
  mockAudioModeResolvers.shift()?.();
}

/** A status as expo-audio reports it, with every field set to its idle value unless given. */
export function status(partial: Record<string, unknown>) {
  return {
    isLoaded: true,
    playing: false,
    isBuffering: false,
    didJustFinish: false,
    currentTime: 0,
    error: null,
    ...partial,
  };
}

export function fakeExpoAudio() {
  return {
    setAudioModeAsync: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          mockAudioModeResolvers.push(resolve);
        }),
    ),
    createAudioPlayer: jest.fn(() => {
      const player: MockPlayer & { addListener: jest.Mock } = {
        listener: null,
        play: jest.fn(),
        pause: jest.fn(),
        replace: jest.fn(),
        seekTo: jest.fn(() => Promise.resolve()),
        setPlaybackRate: jest.fn(),
        setActiveForLockScreen: jest.fn(),
        clearLockScreenControls: jest.fn(),
        remove: jest.fn(),
        volume: 1,
        addListener: jest.fn((_event: string, listener: StatusListener) => {
          player.listener = listener;
          return { remove: jest.fn() };
        }),
      };
      mockPlayers.push(player);
      return player;
    }),
  };
}
