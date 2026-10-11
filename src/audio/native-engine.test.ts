import { createNativeAudioEngine } from './native-engine';

import type { ChapterLoad } from './engine';

/*
 * Regression for incident 3 (docs/STATE.md): the narration stopped and started in a loop on
 * Android. react-native-audio-api's `observeAudioInterruptions(true)` requests audio focus, so the
 * app had two focus clients that took focus from each other on every play. expo-audio must be the
 * only client: it pauses and resumes the narration itself, and the engine follows its snapshots.
 */

function mockNode() {
  return { connect: jest.fn(), disconnect: jest.fn() };
}

jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn(() => ({
    currentTime: 0,
    destination: mockNode(),
    createGain: () => ({
      ...mockNode(),
      gain: {
        value: 1,
        cancelScheduledValues: jest.fn(),
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
      },
    }),
    close: jest.fn(() => Promise.resolve()),
  })),
  AudioManager: {
    observeAudioInterruptions: jest.fn(),
    addSystemEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

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
  addListener: jest.Mock;
  volume: number;
}

const mockPlayers: MockPlayer[] = [];

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
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
      addListener: jest.fn((_event: string, listener: StatusListener) => {
        player.listener = listener;
        return { remove: jest.fn() };
      }),
      volume: 1,
    };
    mockPlayers.push(player);
    return player;
  }),
}));

const mockAudioApi = (
  jest.requireMock('react-native-audio-api') as {
    AudioManager: { observeAudioInterruptions: jest.Mock; addSystemEventListener: jest.Mock };
  }
).AudioManager;

function status(overrides: Record<string, unknown>) {
  return {
    isLoaded: true,
    playing: false,
    isBuffering: false,
    didJustFinish: false,
    currentTime: 0,
    error: null,
    ...overrides,
  };
}

const CHAPTER: ChapterLoad = {
  id: 'chapter',
  order: 1,
  title: 'Chapter one',
  seriesTitle: 'Series',
  coverUri: null,
  segments: [
    {
      uri: 'file:///0.wav',
      durationMs: 60_000,
      sentenceStart: 0,
      sentenceEnd: 1,
      sentenceOffsetsMs: [0, 30_000],
    },
  ],
  final: true,
  cues: [],
};

beforeEach(() => {
  mockPlayers.length = 0;
  jest.clearAllMocks();
});

describe('native engine: audio focus', () => {
  it('never asks react-native-audio-api for audio focus', async () => {
    const engine = createNativeAudioEngine({ resolveBed: () => null });
    await engine.load(CHAPTER, 0);
    engine.play();
    engine.pause();
    engine.play();
    engine.dispose();

    expect(mockAudioApi.observeAudioInterruptions).not.toHaveBeenCalled();
    expect(mockAudioApi.addSystemEventListener).not.toHaveBeenCalled();
  });

  it('follows a pause and resume that expo-audio makes on a focus loss, without fighting it', async () => {
    const engine = createNativeAudioEngine({ resolveBed: () => null });
    const states: string[] = [];
    engine.onState((state) => states.push(state));
    await engine.load(CHAPTER, 0);
    const voice = mockPlayers[0];
    if (!voice?.listener) throw new Error('the voice player was not created');

    voice.listener(status({ playing: false })); // the segment has loaded
    const pausesBeforePlay = voice.pause.mock.calls.length;
    engine.play();
    voice.listener(status({ playing: true, currentTime: 1 }));
    // A phone call: expo-audio pauses the player natively, then resumes it when the call ends.
    voice.listener(status({ playing: false, currentTime: 1.2 }));
    voice.listener(status({ playing: true, currentTime: 1.2 }));

    expect(states).toEqual(['loading', 'paused', 'playing', 'paused', 'playing']);
    // The only play is the listener's own. The engine never re-issues play or pause on its own.
    expect(voice.play).toHaveBeenCalledTimes(1);
    expect(voice.pause).toHaveBeenCalledTimes(pausesBeforePlay);
    engine.dispose();
  });
});
