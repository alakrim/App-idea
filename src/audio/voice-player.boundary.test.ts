import {
  mockPlayers,
  releaseAudioMode,
  resetExpoAudioFake,
  status,
} from './__fixtures__/expo-audio-fake';
import { createVoicePlayer } from './voice-player';

import type { VoiceSegment } from './voice-port';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-audio', () => require('./__fixtures__/expo-audio-fake').fakeExpoAudio());

const SEG_A: VoiceSegment = { uri: 'file:///a.m4a', durationMs: 60_000 };
const SEG_B: VoiceSegment = { uri: 'file:///b.m4a', durationMs: 60_000 };
const SEG_C: VoiceSegment = { uri: 'file:///c.m4a', durationMs: 60_000 };
const META = { title: 't', seriesTitle: 's', coverUri: null };

beforeEach(() => {
  resetExpoAudioFake();
});

describe('voice player: segment boundaries keep the lock screen (QA-E E-01)', () => {
  it('a boundary does not unregister the finished player from the lock screen', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEG_A, SEG_B, SEG_C], 0, META);
    releaseAudioMode();
    await loading;
    const [active, incoming] = mockPlayers;
    active?.listener?.(status({ playing: true }));
    // Only the boundary's own calls are counted: the load itself activates the first player.
    for (const player of mockPlayers) player.clearLockScreenControls.mockClear();

    active?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));

    // The new player takes the lock screen by itself. Clearing the finished player first would
    // release the MediaSession and stop the foreground service (expo-audio AudioControlsService).
    expect(active?.clearLockScreenControls).not.toHaveBeenCalled();
    expect(incoming?.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      expect.anything(),
      expect.anything(),
    );
    voice.dispose();
  });
});
