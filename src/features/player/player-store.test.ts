import { type LoadedSegment } from '@/audio/engine';
import { createFakeEngine, type FakeAudioEngine } from '@/audio/fake-engine';
import type { PlaybackPoint } from '@/core/domain/library';
import { SLEEP_FADE_MS } from '@/core/playback/sleep-timer';

import { createPlayerStore, type PlayerStore, type PlayerTimers } from './player-store';

const CHAPTER_ID = '01HZX00000000000000000000C';
const SEGMENTS: LoadedSegment[] = [
  { uri: 'a', durationMs: 4000, sentenceStart: 0, sentenceEnd: 1, sentenceOffsetsMs: [0, 2000] },
  { uri: 'b', durationMs: 6000, sentenceStart: 2, sentenceEnd: 3, sentenceOffsetsMs: [0, 3000] },
];
/** One ten-minute segment, so sleep tests never reach the end by accident. */
const LONG_SEGMENTS: LoadedSegment[] = [
  {
    uri: 'long',
    durationMs: 600_000,
    sentenceStart: 0,
    sentenceEnd: 2,
    sentenceOffsetsMs: [0, 200_000, 400_000],
  },
];
const CHAPTER = {
  id: CHAPTER_ID,
  order: 3,
  title: 'Three',
  seriesTitle: 'Series',
  coverUri: null,
  segments: SEGMENTS,
  final: true,
  cues: [],
};

/**
 * Timers and clock driven together by `run`, so the sleep ticker and the virtual voice stay in
 * step. Intervals fire every `ms`, and timeouts fire once when due.
 */
function createClock() {
  let now = 0;
  let nextHandle = 1;
  const timeouts = new Map<number, { at: number; callback: () => void }>();
  const intervals = new Map<number, { every: number; next: number; callback: () => void }>();
  const timers: PlayerTimers = {
    setTimeout(callback, ms) {
      const handle = nextHandle++;
      timeouts.set(handle, { at: now + ms, callback });
      return handle;
    },
    clearTimeout(handle) {
      timeouts.delete(handle as number);
    },
    setInterval(callback, ms) {
      const handle = nextHandle++;
      intervals.set(handle, { every: ms, next: now + ms, callback });
      return handle;
    },
    clearInterval(handle) {
      intervals.delete(handle as number);
    },
  };
  return {
    timers,
    now: () => now,
    intervalCount: () => intervals.size,
    /** Moves time forward in 250 ms steps, firing due timers in order. */
    run(ms: number, onStep?: (stepMs: number) => void) {
      const end = now + ms;
      while (now < end) {
        const step = Math.min(250, end - now);
        now += step;
        onStep?.(step);
        for (const [handle, t] of [...timeouts]) {
          if (t.at <= now) {
            timeouts.delete(handle);
            t.callback();
          }
        }
        for (const i of intervals.values()) {
          while (i.next <= now) {
            i.callback();
            i.next += i.every;
          }
        }
      }
    },
  };
}

function setup(options: { saveWindowMs?: number } = {}) {
  const engine: FakeAudioEngine = createFakeEngine();
  const saved: PlaybackPoint[] = [];
  const clock = createClock();
  const store: PlayerStore = createPlayerStore({
    engine,
    savePosition: (point) => saved.push(point),
    timers: clock.timers,
    now: clock.now,
    ...options,
  });
  /** Advances the voice and the store's timers together. */
  const run = (ms: number) => clock.run(ms, (step) => engine.advance(step));
  return { engine, store, saved, clock, run };
}

describe('player store: loading and state', () => {
  it('records what is playing and starts at the requested position', async () => {
    const { store, engine } = setup();
    await store.load(CHAPTER, 2500);
    expect(store.getState().nowPlaying).toEqual({
      chapterId: CHAPTER_ID,
      chapterOrder: 3,
      title: 'Three',
      seriesTitle: 'Series',
      coverUri: null,
    });
    expect(store.getState().positionMs).toBe(2500);
    expect(store.getState().sentenceIdx).toBe(1);
    expect(engine.ambienceCommands).toEqual([]);
    store.dispose();
  });

  it('follows the engine for state, position and sentence', async () => {
    const { store, run } = setup();
    await store.load(CHAPTER, 0);
    store.play();
    run(2500);
    expect(store.getState().state).toBe('playing');
    expect(store.getState().positionMs).toBe(2500);
    expect(store.getState().sentenceIdx).toBe(1);
    store.dispose();
  });

  it('toggles between play and pause', async () => {
    const { store } = setup();
    await store.load(CHAPTER, 0);
    store.togglePlay();
    expect(store.getState().state).toBe('playing');
    store.togglePlay();
    expect(store.getState().state).toBe('paused');
    store.dispose();
  });

  it('validates the rate and stores valid ones', async () => {
    const { store, engine } = setup();
    await store.load(CHAPTER, 0);
    expect(() => store.setRate(3)).toThrow(RangeError);
    expect(store.getState().rate).toBe(1);
    store.setRate(1.75);
    expect(store.getState().rate).toBe(1.75);
    store.dispose();
    expect(engine.voiceVolume).toBe(1);
  });

  it('adds progressive segments and keeps the chapter open until the last one', async () => {
    const { store, run } = setup();
    await store.load({ ...CHAPTER, segments: SEGMENTS.slice(0, 1), final: false }, 0);
    store.play();
    run(6000);
    expect(store.getState().state).toBe('buffering');
    store.appendSegments([SEGMENTS[1] as LoadedSegment], true);
    expect(store.getState().state).toBe('playing');
    store.dispose();
  });
});

describe('player store: position persistence', () => {
  it('saves at most once per window during continuous playback, with the newest point', async () => {
    const { store, saved, run } = setup({ saveWindowMs: 5000 });
    await store.load(CHAPTER, 0);
    store.play();
    run(4000);
    expect(saved).toEqual([]);
    run(1000);
    expect(saved).toEqual([{ chapterId: CHAPTER_ID, chapterOrder: 3, sentenceIdx: 2 }]);
    store.dispose();
  });

  it('saves immediately on pause, without waiting for the window', async () => {
    const { store, saved, run } = setup({ saveWindowMs: 5000 });
    await store.load(CHAPTER, 0);
    store.play();
    run(2600);
    store.pause();
    expect(saved.at(-1)).toEqual({ chapterId: CHAPTER_ID, chapterOrder: 3, sentenceIdx: 1 });
    store.dispose();
  });

  it('flushes the outgoing chapter before a new one loads', async () => {
    const { store, saved, run } = setup({ saveWindowMs: 5000 });
    await store.load(CHAPTER, 0);
    store.play();
    run(1000);
    await store.load({ ...CHAPTER, id: '01HZX00000000000000000000D', order: 4 }, 0);
    expect(saved).toEqual([{ chapterId: CHAPTER_ID, chapterOrder: 3, sentenceIdx: 0 }]);
    store.dispose();
  });

  it('flushPosition saves a pending point (background hook)', async () => {
    const { store, saved, run } = setup({ saveWindowMs: 5000 });
    await store.load(CHAPTER, 0);
    store.play();
    run(1000);
    store.flushPosition();
    expect(saved).toHaveLength(1);
    store.dispose();
  });

  it('dispose saves the last position and stops listening', async () => {
    const { store, saved, run, engine } = setup({ saveWindowMs: 5000 });
    await store.load(CHAPTER, 0);
    store.play();
    run(1000);
    store.dispose();
    expect(saved).toHaveLength(1);
    run(10_000);
    engine.advance(1000);
    expect(saved).toHaveLength(1);
  });
});

describe('player store: sleep timer', () => {
  it('fades the voice over ten seconds from the end time, then pauses and resets', async () => {
    const { store, engine, run } = setup();
    await store.load({ ...CHAPTER, segments: LONG_SEGMENTS }, 0);
    store.play();
    store.setSleepTimer({ mode: 'minutes', minutes: 1 });
    expect(store.getState().sleepTimer).toEqual({ mode: 'minutes', endsAt: 60_000 });

    run(60_000);
    expect(store.getState().state).toBe('playing');
    run(SLEEP_FADE_MS / 2);
    expect(engine.voiceVolume).toBeCloseTo(0.5, 1);
    expect(store.getState().state).toBe('playing');

    run(SLEEP_FADE_MS / 2 + 500);
    expect(store.getState().state).toBe('paused');
    expect(store.getState().sleepTimer).toEqual({ mode: 'off', endsAt: null });
    expect(engine.voiceVolume).toBe(1);
    store.dispose();
  });

  it('does not tick until the fade is due, then ticks only while it fades', async () => {
    const { store, run, clock } = setup();
    await store.load({ ...CHAPTER, segments: LONG_SEGMENTS }, 0);
    store.play();
    store.setSleepTimer({ mode: 'minutes', minutes: 1 });

    run(59_000);
    expect(clock.intervalCount()).toBe(0);

    run(1000);
    expect(clock.intervalCount()).toBe(1);
    store.dispose();
  });

  it('pauses at the end of the chapter with an end-of-chapter timer', async () => {
    const { store, engine, run } = setup();
    await store.load({ ...CHAPTER, segments: LONG_SEGMENTS }, 0);
    store.play();
    store.setSleepTimer({ mode: 'endOfChapter' });
    run(595_000);
    expect(store.getState().state).toBe('playing');
    expect(engine.voiceVolume).toBeLessThan(1);
    run(10_000);
    expect(store.getState().state).toBe('ended');
    expect(store.getState().sleepTimer.mode).toBe('off');
    expect(engine.voiceVolume).toBe(1);
    store.dispose();
  });

  it('never fades an end-of-chapter timer while the chapter length is still unknown', async () => {
    const { store, engine, run } = setup();
    await store.load({ ...CHAPTER, segments: SEGMENTS.slice(0, 1), final: false }, 0);
    store.play();
    store.setSleepTimer({ mode: 'endOfChapter' });
    run(4500);
    expect(engine.voiceVolume).toBe(1);
    expect(store.getState().state).toBe('buffering');
    store.dispose();
  });

  it('cancels a timer, restoring full volume and stopping the ticker', async () => {
    const { store, engine, run, clock } = setup();
    await store.load({ ...CHAPTER, segments: LONG_SEGMENTS }, 0);
    store.play();
    store.setSleepTimer({ mode: 'minutes', minutes: 1 });
    run(62_000);
    expect(engine.voiceVolume).toBeLessThan(1);
    store.setSleepTimer({ mode: 'off' });
    expect(engine.voiceVolume).toBe(1);
    expect(store.getState().sleepTimer.mode).toBe('off');
    expect(clock.intervalCount()).toBe(0);
    store.dispose();
  });

  it('rejects a timer length outside 1 to 240 minutes', async () => {
    const { store } = setup();
    await store.load({ ...CHAPTER, segments: LONG_SEGMENTS }, 0);
    expect(() => store.setSleepTimer({ mode: 'minutes', minutes: 0 })).toThrow(RangeError);
    expect(store.getState().sleepTimer.mode).toBe('off');
    store.dispose();
  });
});
