import { createPlaybackHealthLog } from '@/core/playback/playback-health';

import { createVoicePlayer } from './voice-player';

import type { VoiceSegment } from './voice-port';

/*
 * What the voice player records for the Diagnostics "Playback health" card: boundary gaps, buffering
 * starts and system pauses. The expo-audio mock is the same as voice-player.test.ts.
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

const SEG_A: VoiceSegment = { uri: 'file:///a.m4a', durationMs: 60_000 };
const SEG_B: VoiceSegment = { uri: 'file:///b.m4a', durationMs: 60_000 };
const META = { title: 't', seriesTitle: 's', coverUri: null };

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

function withClock() {
  let now = 0;
  const health = createPlaybackHealthLog({ now: () => now });
  return { health, advance: (ms: number) => (now += ms) };
}

beforeEach(() => {
  mockPlayers.length = 0;
  mockAudioModeResolvers.length = 0;
});

async function loadTwo(health: ReturnType<typeof createPlaybackHealthLog>) {
  const voice = createVoicePlayer({ health });
  const loading = voice.load([SEG_A, SEG_B], 0, META);
  mockAudioModeResolvers.shift()?.();
  await loading;
  return voice;
}

describe('voice player: playback health', () => {
  it('records the gap from a segment ending to the next segment playing', async () => {
    const clock = withClock();
    const voice = await loadTwo(clock.health);
    const [first, second] = mockPlayers;
    first?.listener?.(status({ playing: true, currentTime: 1 }));

    clock.advance(10);
    first?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));
    clock.advance(120);
    second?.listener?.(status({ playing: true, currentTime: 0.05 }));

    expect(clock.health.summary().boundaries).toEqual({
      count: 1,
      p50Ms: 120,
      p95Ms: 120,
      maxMs: 120,
    });
    voice.dispose();
  });

  it('counts one buffering start per episode, not per buffering status', async () => {
    const clock = withClock();
    const voice = await loadTwo(clock.health);
    const [slot] = mockPlayers;
    slot?.listener?.(status({ playing: true, currentTime: 1 }));
    slot?.listener?.(status({ playing: true, isBuffering: true, currentTime: 1 }));
    slot?.listener?.(status({ playing: true, isBuffering: true, currentTime: 1 }));
    slot?.listener?.(status({ playing: true, currentTime: 2 }));
    slot?.listener?.(status({ playing: true, isBuffering: true, currentTime: 2 }));

    expect(clock.health.summary().bufferingStarts).toBe(2);
    voice.dispose();
  });

  it('counts a pause the system made while the listener wanted play, not one they asked for', async () => {
    const clock = withClock();
    const voice = await loadTwo(clock.health);
    const [slot] = mockPlayers;
    voice.play();
    slot?.listener?.(status({ playing: true, currentTime: 1 }));
    slot?.listener?.(status({ playing: false, currentTime: 1.2 }));
    expect(clock.health.summary().focusLossPauses).toBe(1);

    voice.pause();
    slot?.listener?.(status({ playing: true, currentTime: 2 }));
    slot?.listener?.(status({ playing: false, currentTime: 2 }));
    expect(clock.health.summary().focusLossPauses).toBe(1);
    voice.dispose();
  });
});
