/*
 * QA-E proofs (2026-10-17), in the voice player. They assert the behaviour the fix must reach, so
 * they FAIL on the unified code. Excluded from `npm test` by testPathIgnorePatterns in jest.config.js.
 * Run them with: npx jest --testPathIgnorePatterns=/node_modules/ voice-player.audit
 */
import { createVoicePlayer } from './voice-player';

import type { VoiceSegment, VoiceSnapshot } from './voice-port';

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

const META = { title: 't', seriesTitle: 's', coverUri: null };
const SEG_A: VoiceSegment = { uri: 'file:///a.m4a', durationMs: 60_000 };
const SEG_B: VoiceSegment = { uri: 'file:///b.m4a', durationMs: 60_000 };
const SEG_C: VoiceSegment = { uri: 'file:///c.m4a', durationMs: 60_000 };

function releaseAudioMode(): void {
  mockAudioModeResolvers.shift()?.();
}

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

describe('QA-E proof: a seek near a boundary (P2-A)', () => {
  it('a finish reported for the file being replaced by a seek does not skip the chapter', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEG_A, SEG_B, SEG_C], 0, META);
    releaseAudioMode();
    await loading;
    const [slot] = mockPlayers;
    const snapshots: VoiceSnapshot[] = [];
    voice.onSnapshot((snapshot) => snapshots.push(snapshot));
    slot?.listener?.(status({ playing: true }));

    // Seek 10 s into segment C. The slot now holds C, but the platform may still deliver the
    // didJustFinish of the file it was playing before the replace.
    await voice.seekTo(130_000);
    slot?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));

    // Expected: no ended transition, because the event is about the old file. Today onStatus()
    // trusts any finish from the active slot, so advance() runs with index 2, reports ended and
    // the rest of the chapter is dropped.
    expect(snapshots.some((snapshot) => snapshot.ended)).toBe(false);
    voice.dispose();
  });
});

describe('QA-E proof: focus returns after the listener paused (P1-C)', () => {
  it('a playing status that arrives after the listener paused is paused again', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEG_A, SEG_B], 0, META);
    releaseAudioMode();
    await loading;
    const [slot] = mockPlayers;
    voice.play();
    slot?.listener?.(status({ playing: true }));
    voice.pause();
    slot?.pause.mockClear();

    // A phone call or a navigation prompt took focus, so expo-audio paused the narration and set its
    // isPaused flag. The listener pressed pause during it. expo-audio's pause() does not clear that
    // flag (AudioModule.kt: isPaused is only cleared on focus gain and on foreground), so when focus
    // comes back the narration plays again without anyone asking. Expected: the voice holds the pause.
    slot?.listener?.(status({ playing: true }));

    expect(slot?.pause).toHaveBeenCalled();
    voice.dispose();
  });
});
