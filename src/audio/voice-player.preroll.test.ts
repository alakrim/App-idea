import { createPlaybackHealthLog } from '@/core/playback/playback-health';
import { createVirtualTimers } from '@/core/playback/timers';

import {
  mockPlayers,
  releaseAudioMode,
  resetExpoAudioFake,
  status,
} from './__fixtures__/expo-audio-fake';
import { createVoicePlayer, PRE_ROLL_MS } from './voice-player';

import type { VoiceSegment } from './voice-port';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-audio', () => require('./__fixtures__/expo-audio-fake').fakeExpoAudio());

const SEG_A: VoiceSegment = { uri: 'file:///a.m4a', durationMs: 60_000 };
const SEG_B: VoiceSegment = { uri: 'file:///b.m4a', durationMs: 60_000 };
const META = { title: 't', seriesTitle: 's', coverUri: null };

beforeEach(() => {
  resetExpoAudioFake();
});

/** A chapter of two segments with the voice playing segment A. The clock and timers move together. */
async function playingChapter() {
  let now = 0;
  const timers = createVirtualTimers();
  const health = createPlaybackHealthLog({ now: () => now });
  const voice = createVoicePlayer({ health, timers });
  const loading = voice.load([SEG_A, SEG_B], 0, META);
  releaseAudioMode();
  await loading;
  voice.play();
  // The two players this chapter created: a test may build more than one chapter.
  const [outgoing, incoming] = mockPlayers.slice(-2);
  return {
    voice,
    health,
    outgoing,
    incoming,
    /** Moves time forward for the health clock and the pending timers together. */
    run(ms: number) {
      // One millisecond at a time, so a timer that fires sees the clock at its due time.
      for (let step = 0; step < ms; step += 1) {
        now += 1;
        timers.advance(1);
      }
    },
  };
}

describe('voice player: pre-roll at a segment boundary', () => {
  it('starts the incoming segment PRE_ROLL_MS before the outgoing one ends', async () => {
    const chapter = await playingChapter();
    chapter.incoming?.listener?.(status({ isLoaded: true }));
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));

    // 500 ms of audio are left: the pre-roll fires 80 ms before the end, i.e. after 420 ms.
    chapter.run(419);
    expect(chapter.incoming?.play).not.toHaveBeenCalled();
    chapter.run(1);
    expect(chapter.incoming?.play).toHaveBeenCalledTimes(1);
    chapter.voice.dispose();
  });

  it('stops the outgoing segment once the incoming one reports audible playback', async () => {
    const chapter = await playingChapter();
    chapter.incoming?.listener?.(status({ isLoaded: true }));
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));
    chapter.run(420);
    chapter.outgoing?.pause.mockClear();

    chapter.incoming?.listener?.(status({ playing: true, currentTime: 0.02 }));

    expect(chapter.outgoing?.pause).toHaveBeenCalled();
    chapter.voice.dispose();
  });

  it('starts the incoming segment once, however many statuses arrive before the boundary', async () => {
    const chapter = await playingChapter();
    chapter.incoming?.listener?.(status({ isLoaded: true }));
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));
    chapter.run(420);
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.7 }));
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.9 }));
    chapter.run(1000);

    expect(chapter.incoming?.play).toHaveBeenCalledTimes(1);
    chapter.voice.dispose();
  });

  it('completes the swap without a second start when the finish arrives before the pre-roll fires', async () => {
    const chapter = await playingChapter();
    chapter.incoming?.listener?.(status({ isLoaded: true }));
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));
    chapter.outgoing?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));
    chapter.run(1000);

    expect(chapter.incoming?.play).toHaveBeenCalledTimes(1);
    chapter.voice.dispose();
  });

  it('does not pre-roll into a segment that is not loaded, and plays it when it loads', async () => {
    const chapter = await playingChapter();
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));
    chapter.run(1000);
    expect(chapter.incoming?.play).not.toHaveBeenCalled();

    chapter.outgoing?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));
    expect(chapter.incoming?.play).not.toHaveBeenCalled();
    chapter.incoming?.listener?.(status({ isLoaded: true }));
    expect(chapter.incoming?.play).toHaveBeenCalledTimes(1);
    chapter.voice.dispose();
  });

  it('cancels a pending pre-roll when the listener pauses', async () => {
    const chapter = await playingChapter();
    chapter.incoming?.listener?.(status({ isLoaded: true }));
    chapter.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));
    chapter.voice.pause();
    chapter.run(1000);

    expect(chapter.incoming?.play).not.toHaveBeenCalled();
    chapter.voice.dispose();
  });

  it('measures the boundary gap from the predicted end, so the pre-roll gains over a start on finish', async () => {
    // Pre-roll: the incoming player plays 100 ms after it was started. Its audible start is 20 ms
    // after the outgoing segment ends.
    const preRoll = await playingChapter();
    preRoll.incoming?.listener?.(status({ isLoaded: true }));
    preRoll.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));
    preRoll.run(420);
    preRoll.run(100);
    preRoll.incoming?.listener?.(status({ playing: true, currentTime: 0.02 }));
    const withPreRoll = preRoll.health.summary().boundaries.maxMs;
    preRoll.voice.dispose();

    // Start on finish: the incoming segment loads when the outgoing finishes, and plays 100 ms later.
    const onFinish = await playingChapter();
    onFinish.outgoing?.listener?.(status({ playing: true, currentTime: 59.5 }));
    onFinish.run(500);
    onFinish.outgoing?.listener?.(status({ playing: false, didJustFinish: true, currentTime: 60 }));
    onFinish.incoming?.listener?.(status({ isLoaded: true }));
    onFinish.run(100);
    onFinish.incoming?.listener?.(status({ playing: true, currentTime: 0.02 }));
    const withoutPreRoll = onFinish.health.summary().boundaries.maxMs;
    onFinish.voice.dispose();

    expect(withPreRoll).toBe(20);
    expect(withoutPreRoll).toBe(100);
    expect((withoutPreRoll ?? 0) - (withPreRoll ?? 0)).toBe(PRE_ROLL_MS);
  });
});
