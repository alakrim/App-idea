import { createVoicePlayer } from './voice-player';

import type { VoiceSegment } from './voice-port';

/*
 * The voice player on a mocked expo-audio. Each test controls when the audio mode resolves, which
 * is the await that a load, a seek or a dispose can overlap.
 */

type StatusListener = (status: Record<string, unknown>) => void;

interface MockPlayer {
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

const mockPlayers: MockPlayer[] = [];
const mockAudioModeResolvers: (() => void)[] = [];

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(
    () =>
      new Promise<void>((resolve) => {
        mockAudioModeResolvers.push(resolve);
      }),
  ),
  createAudioPlayer: jest.fn(() => {
    const player: MockPlayer = {
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
    } as MockPlayer & { addListener: jest.Mock };
    mockPlayers.push(player);
    return player;
  }),
}));

const SEGMENT: VoiceSegment = { uri: 'file:///a.m4a', durationMs: 60_000 };
const META = { title: 't', seriesTitle: 's', coverUri: null };

/** Lets the audio mode of the oldest pending load resolve. */
function releaseAudioMode(): void {
  mockAudioModeResolvers.shift()?.();
}

/** Lets promise continuations run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function status(partial: Record<string, unknown>) {
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

beforeEach(() => {
  mockPlayers.length = 0;
  mockAudioModeResolvers.length = 0;
});

describe('voice player: a dispose or a newer load while the audio mode is set (P2-2, P2-3)', () => {
  it('creates no players when dispose runs before the load settles', async () => {
    const voice = createVoicePlayer();
    const pending = voice.load([SEGMENT], 0, META);
    voice.dispose();
    releaseAudioMode();
    await pending;
    await settle();

    expect(mockPlayers).toHaveLength(0);
  });

  it('lets only the newest of two overlapping loads create players', async () => {
    const voice = createVoicePlayer();
    const first = voice.load([SEGMENT], 0, META);
    const second = voice.load([{ uri: 'file:///b.m4a', durationMs: 30_000 }], 0, META);
    releaseAudioMode();
    await first;
    expect(mockPlayers).toHaveLength(0);

    releaseAudioMode();
    await second;
    expect(mockPlayers).toHaveLength(2);
    expect(mockPlayers[0]?.replace).toHaveBeenCalledWith({ uri: 'file:///b.m4a' });
    voice.dispose();
  });
});

describe('voice player: a seek made before the first load settles (P2-4)', () => {
  it('starts the loaded chapter at a seek made while the audio mode was being set', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEGMENT], 5000, META);
    const seeking = voice.seekTo(20_000);
    releaseAudioMode();
    await loading;
    await seeking;
    const active = mockPlayers[0];
    active?.listener?.(status({ isLoaded: true }));

    expect(active?.seekTo).toHaveBeenLastCalledWith(20);
    voice.dispose();
  });

  it('applies a seek made to the segment that is still loading, instead of the start position', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEGMENT], 5000, META);
    releaseAudioMode();
    await loading;
    const active = mockPlayers[0];
    await voice.seekTo(20_000);
    expect(active?.seekTo).not.toHaveBeenCalled();

    active?.listener?.(status({ isLoaded: true }));
    expect(active?.seekTo).toHaveBeenCalledTimes(1);
    expect(active?.seekTo).toHaveBeenLastCalledWith(20);
    voice.dispose();
  });
});
