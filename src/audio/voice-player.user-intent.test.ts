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
const META = { title: 't', seriesTitle: 's', coverUri: null };

beforeEach(() => {
  resetExpoAudioFake();
});

async function playingVoice() {
  const voice = createVoicePlayer();
  const loading = voice.load([SEG_A, SEG_B], 0, META);
  releaseAudioMode();
  await loading;
  const [slot] = mockPlayers;
  voice.play();
  slot?.listener?.(status({ playing: true, currentTime: 1 }));
  return { voice, slot };
}

describe('voice player: the listener’s pause holds (QA-E E-03)', () => {
  it('a playing status that arrives after the listener paused is paused again', async () => {
    const { voice, slot } = await playingVoice();
    voice.pause();
    slot?.pause.mockClear();

    // A phone call or a navigation prompt took focus, so expo-audio paused the narration and set its
    // isPaused flag. The listener pressed pause during it. expo-audio's pause() does not clear that
    // flag (AudioModule.kt: isPaused is only cleared on focus gain and on foreground), so when focus
    // comes back the narration plays again without anyone asking. Expected: the voice holds the pause.
    slot?.listener?.(status({ playing: true, currentTime: 2 }));

    expect(slot?.pause).toHaveBeenCalled();
    voice.dispose();
  });

  it('reports paused, not playing, while the listener’s pause holds', async () => {
    const { voice, slot } = await playingVoice();
    const snapshots: VoiceSnapshot[] = [];
    voice.onSnapshot((snapshot) => snapshots.push(snapshot));
    voice.pause();

    slot?.listener?.(status({ playing: true, currentTime: 2 }));

    expect(snapshots.at(-1)?.playing).toBe(false);
    voice.dispose();
  });

  it('keeps a system pause resumable: the narration plays again when the listener presses play', async () => {
    const { voice, slot } = await playingVoice();
    // The system paused it (a call started) and the listener still wants it playing.
    slot?.listener?.(status({ playing: false, currentTime: 2 }));
    slot?.play.mockClear();

    // Focus comes back: expo-audio resumes on its own, and the listener's intent is still play.
    slot?.pause.mockClear();
    slot?.listener?.(status({ playing: true, currentTime: 2 }));
    expect(slot?.pause).not.toHaveBeenCalled();

    voice.pause();
    voice.play();
    expect(slot?.play).toHaveBeenCalled();
    voice.dispose();
  });
});
