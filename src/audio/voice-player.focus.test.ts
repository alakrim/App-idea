import { setAudioModeAsync } from 'expo-audio';

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
// Three segments, so the outgoing player is reloaded with the segment after the incoming one.
const SEG_C = { uri: 'file:///c.m4a', durationMs: 60_000 };
const META = { title: 't', seriesTitle: 's', coverUri: null };

beforeEach(() => {
  resetExpoAudioFake();
  jest.mocked(setAudioModeAsync).mockClear();
});

async function playingVoice() {
  const voice = createVoicePlayer();
  const loading = voice.load([SEG_A, SEG_B, SEG_C], 0, META);
  releaseAudioMode();
  await loading;
  const [first, second] = mockPlayers;
  voice.play();
  first?.listener?.(status({ playing: true, currentTime: 1 }));
  return { voice, first, second };
}

describe('voice player: focus from other apps (E-08)', () => {
  it('asks for the duckOthers audio mode, so a transient duck lowers the narration', async () => {
    const loading = createVoicePlayer().load([SEG_A], 0, META);
    releaseAudioMode();
    await loading;

    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ interruptionMode: 'duckOthers' }),
    );
  });

  it('a platform duck keeps the narration playing: no pause is sent and the state stays playing', async () => {
    const { voice, first } = await playingVoice();
    const snapshots: VoiceSnapshot[] = [];
    voice.onSnapshot((snapshot) => snapshots.push(snapshot));
    first?.pause.mockClear();

    // expo-audio lowers the player's volume for a ducking request and does not pause it, so the
    // status keeps reporting playback with the position advancing.
    first?.listener?.(status({ playing: true, currentTime: 1.25 }));

    expect(first?.pause).not.toHaveBeenCalled();
    expect(snapshots.at(-1)?.playing).toBe(true);
    voice.dispose();
  });

  it('a boundary does not reset the volume the platform ducked', async () => {
    const { voice, first, second } = await playingVoice();
    second?.listener?.(status({ isLoaded: true }));
    first?.listener?.(status({ playing: true, currentTime: 59.5 }));
    // The platform has lowered the outgoing player for a navigation prompt.
    if (first) first.volume = 0.5;

    first?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));

    expect(first?.volume).toBe(0.5);
    voice.dispose();
  });

  it('a real interruption still pauses, and the listener’s play request is kept', async () => {
    const { voice, first } = await playingVoice();
    // A call: expo-audio pauses the narration (playing false) and keeps the listener's intent.
    first?.listener?.(status({ playing: false, currentTime: 2 }));
    first?.pause.mockClear();

    // The call ends and focus comes back: expo-audio resumes on its own, which the voice accepts.
    first?.listener?.(status({ playing: true, currentTime: 2 }));

    expect(first?.pause).not.toHaveBeenCalled();
    voice.dispose();
  });
});
