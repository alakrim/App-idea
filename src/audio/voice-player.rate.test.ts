import {
  mockPlayers,
  releaseAudioMode,
  resetExpoAudioFake,
  status,
} from './__fixtures__/expo-audio-fake';
import { createVoicePlayer } from './voice-player';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-audio', () => require('./__fixtures__/expo-audio-fake').fakeExpoAudio());

const SEG = { uri: 'file:///a.m4a', durationMs: 60_000 };
const META = { title: 't', seriesTitle: 's', coverUri: null };

beforeEach(() => {
  resetExpoAudioFake();
});

/** Every rate call the mocked players have received, across all of them. */
function rateCalls(): number {
  return mockPlayers.reduce((total, player) => total + player.setPlaybackRate.mock.calls.length, 0);
}

describe('voice player: the playback rate is set only when it changes (QA-E E-11)', () => {
  it('sends no rate call when a chapter loads at the default rate', async () => {
    const loading = createVoicePlayer().load([SEG, SEG], 0, META);
    releaseAudioMode();
    await loading;

    expect(rateCalls()).toBe(0);
  });

  it('gives each player the new rate once when the rate changes', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEG, SEG, SEG], 0, META);
    releaseAudioMode();
    await loading;

    voice.setRate(1.5);

    expect(rateCalls()).toBe(2);
    for (const player of mockPlayers) {
      expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5, 'high');
    }
    voice.dispose();
  });

  it('a boundary at 1.5x does not set the rate again, because the platform player keeps it', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEG, SEG, SEG], 0, META);
    releaseAudioMode();
    await loading;
    voice.setRate(1.5);
    voice.play();
    const [outgoing] = mockPlayers;
    outgoing?.listener?.(status({ playing: true, currentTime: 1 }));
    const beforeBoundary = rateCalls();

    outgoing?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));

    expect(rateCalls()).toBe(beforeBoundary);
    voice.dispose();
  });

  it('a rate set again to the same value sends nothing', async () => {
    const voice = createVoicePlayer();
    const loading = voice.load([SEG], 0, META);
    releaseAudioMode();
    await loading;
    voice.setRate(2);
    const before = rateCalls();

    voice.setRate(2);

    expect(rateCalls()).toBe(before);
    voice.dispose();
  });
});
