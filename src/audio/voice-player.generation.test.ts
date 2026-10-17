import {
  mockPlayers,
  releaseAudioMode,
  resetExpoAudioFake,
  status,
} from './__fixtures__/expo-audio-fake';
import { createVoicePlayer } from './voice-player';

import type { VoiceSnapshot } from './voice-port';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-audio', () => require('./__fixtures__/expo-audio-fake').fakeExpoAudio());

const SEG_A = { uri: 'file:///a.m4a', durationMs: 60_000 };
const SEG_B = { uri: 'file:///b.m4a', durationMs: 60_000 };
const SEG_C = { uri: 'file:///c.m4a', durationMs: 60_000 };
const META = { title: 't', seriesTitle: 's', coverUri: null };

beforeEach(() => {
  resetExpoAudioFake();
});

async function playingVoice() {
  const voice = createVoicePlayer();
  const loading = voice.load([SEG_A, SEG_B, SEG_C], 0, META);
  releaseAudioMode();
  await loading;
  const [slot] = mockPlayers;
  voice.play();
  slot?.listener?.(status({ playing: true }));
  return { voice, slot };
}

describe('voice player: a stale status from the replaced file is ignored (QA-E E-04)', () => {
  it('a finish reported for the file being replaced by a seek does not skip the chapter', async () => {
    const { voice, slot } = await playingVoice();
    const snapshots: VoiceSnapshot[] = [];
    voice.onSnapshot((snapshot) => snapshots.push(snapshot));

    // Seek 10 s into segment C. The slot now holds C, but the platform may still deliver the
    // didJustFinish of the file it was playing before the replace.
    await voice.seekTo(130_000);
    slot?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));

    expect(snapshots.some((snapshot) => snapshot.ended)).toBe(false);
    voice.dispose();
  });

  it('a loaded flag from the replaced file does not consume the seek meant for the new file', async () => {
    const { voice, slot } = await playingVoice();
    await voice.seekTo(130_000);
    slot?.seekTo.mockClear();

    // The old file is still reporting, far into its own audio: it must not apply the new seek.
    slot?.listener?.(status({ isLoaded: true, currentTime: 59 }));
    expect(slot?.seekTo).not.toHaveBeenCalled();

    // The new file reports at its start: now the seek applies, at the position it was asked for.
    slot?.listener?.(status({ isLoaded: true, currentTime: 0 }));
    expect(slot?.seekTo).toHaveBeenCalledWith(10);
    voice.dispose();
  });

  it('a seek within the loaded file is applied at once, because that file has reported', async () => {
    const { voice, slot } = await playingVoice();
    slot?.seekTo.mockClear();

    await voice.seekTo(30_000);

    expect(slot?.seekTo).toHaveBeenCalledWith(30);
    voice.dispose();
  });
});
