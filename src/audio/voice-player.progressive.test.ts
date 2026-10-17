import {
  mockPlayers,
  releaseAudioMode,
  resetExpoAudioFake,
  status,
} from './__fixtures__/expo-audio-fake';
import { createVoicePlayer, RESUME_LEAD_MS } from './voice-player';

import type { VoiceSegment } from './voice-port';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-audio', () => require('./__fixtures__/expo-audio-fake').fakeExpoAudio());

const META = { title: 't', seriesTitle: 's', coverUri: null };

beforeEach(() => {
  resetExpoAudioFake();
});

/** A progressive chapter that has played its only segment and run dry, with the voice wanting play. */
async function dryChapter() {
  const voice = createVoicePlayer();
  const loading = voice.load([{ uri: 'file:///a.m4a', durationMs: 10_000 }], 0, META);
  releaseAudioMode();
  await loading;
  const [first, second] = mockPlayers;
  voice.play();
  first?.listener?.(status({ playing: true }));
  first?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 10 }));
  second?.play.mockClear();
  return { voice, second };
}

describe('voice player: progressive narration resumes with a usable lead (QA-E E-02)', () => {
  it('a resume after running dry waits for a usable lead instead of one 4 s segment', async () => {
    const { voice, second } = await dryChapter();

    // Narration is slower than playback: the next segment arrives 4 s long. Resuming on it would
    // run dry again 4 s later, which is the stop-start loop the listener hears.
    voice.append([{ uri: 'file:///b.m4a', durationMs: 4_000 }]);

    expect(second?.play).not.toHaveBeenCalled();
    voice.dispose();
  });

  it('resumes once the audio past the dry point reaches RESUME_LEAD_MS', async () => {
    const { voice, second } = await dryChapter();
    const short: VoiceSegment = { uri: 'file:///b.m4a', durationMs: 4_000 };
    voice.append([short]);
    // Even once the short segment is loaded, the voice holds: a 4 s lead is not enough to resume.
    second?.listener?.(status({ isLoaded: true }));
    expect(second?.play).not.toHaveBeenCalled();

    voice.append([{ uri: 'file:///c.m4a', durationMs: RESUME_LEAD_MS - 4_000 }]);
    // The resumed segment plays once the platform reports it loaded.
    second?.listener?.(status({ isLoaded: true }));

    expect(second?.play).toHaveBeenCalledTimes(1);
    voice.dispose();
  });

  it('resumes at once when the chapter is final, however short the last segment is', async () => {
    const { voice, second } = await dryChapter();

    voice.append([{ uri: 'file:///b.m4a', durationMs: 2_000 }], true);
    second?.listener?.(status({ isLoaded: true }));

    expect(second?.play).toHaveBeenCalledTimes(1);
    voice.dispose();
  });
});
