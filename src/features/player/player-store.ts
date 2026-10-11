import { type StoreApi, type UseBoundStore, create } from 'zustand';

import type { AudioEngine, ChapterLoad, LoadedSegment, PlaybackState } from '@/audio/engine';
import type { PlaybackPoint } from '@/core/domain/library';
import { createPositionSaver } from '@/core/playback/position-saver';
import {
  END_OF_CHAPTER_SLEEP_TIMER,
  SLEEP_TIMER_OFF,
  type SleepTimer,
  minutesSleepTimer,
  sleepPhase,
} from '@/core/playback/sleep-timer';

export const SLEEP_TICK_MS = 250;
export const POSITION_SAVE_WINDOW_MS = 5000;
const MIN_RATE = 0.5;
const MAX_RATE = 2;

export interface PlayerTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemTimers: PlayerTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface NowPlaying {
  chapterId: string;
  chapterOrder: number;
  title: string;
  seriesTitle: string;
  coverUri: string | null;
}

export interface PlayerState {
  nowPlaying: NowPlaying | null;
  state: PlaybackState;
  positionMs: number;
  sentenceIdx: number;
  rate: number;
  sleepTimer: SleepTimer;
}

/** What a sleep-timer request can ask for. */
export type SleepRequest =
  { mode: 'off' } | { mode: 'minutes'; minutes: number } | { mode: 'endOfChapter' };

export interface PlayerActions {
  load(chapter: ChapterLoad, startMs?: number): Promise<void>;
  appendSegments(segments: readonly LoadedSegment[], final: boolean): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  seekTo(ms: number): void;
  setRate(rate: number): void;
  setSleepTimer(request: SleepRequest): void;
  /** Saves the pending position now. Call when the app goes to the background. */
  flushPosition(): void;
  dispose(): void;
}

export interface PlayerStoreDeps {
  engine: AudioEngine;
  /** Persists one position. F0 wires this to the position repo. The store never imports the DB. */
  savePosition: (point: PlaybackPoint) => void;
  timers?: PlayerTimers;
  now?: () => number;
  saveWindowMs?: number;
}

export interface PlayerStore extends PlayerActions {
  /** React hook over the player state, with `getState` for code that is not a component. */
  usePlayerState: UseBoundStore<StoreApi<PlayerState>>;
  getState(): PlayerState;
}

/**
 * Player state and actions over the audio engine. It also runs the sleep timer (a 10 s master fade,
 * then pause) and debounces position saves. Nothing here touches native audio or the database.
 */
export function createPlayerStore(deps: PlayerStoreDeps): PlayerStore {
  const timers = deps.timers ?? systemTimers;
  const now = deps.now ?? Date.now;
  const store = create<PlayerState>()(() => ({
    nowPlaying: null,
    state: 'idle',
    positionMs: 0,
    sentenceIdx: -1,
    rate: 1,
    sleepTimer: SLEEP_TIMER_OFF,
  }));
  const { engine } = deps;
  const saver = createPositionSaver<PlaybackPoint>({
    save: deps.savePosition,
    windowMs: deps.saveWindowMs ?? POSITION_SAVE_WINDOW_MS,
    timers,
  });

  let durationMs = 0;
  let final = true;
  let sleepTicker: unknown = null;

  function stopSleepTicker(): void {
    if (sleepTicker !== null) {
      timers.clearInterval(sleepTicker);
      sleepTicker = null;
    }
  }

  function endSleepTimer(): void {
    stopSleepTicker();
    engine.setVolume(1);
    store.setState({ sleepTimer: SLEEP_TIMER_OFF });
  }

  function sleepTick(): void {
    const { sleepTimer, positionMs } = store.getState();
    const remainingChapterMs = final ? durationMs - positionMs : null;
    const phase = sleepPhase(sleepTimer, now(), remainingChapterMs);
    if (phase.kind === 'fading') {
      engine.setVolume(phase.gain);
    } else if (phase.kind === 'pause') {
      engine.pause();
      endSleepTimer();
    }
  }

  const unsubscribes = [
    engine.onPosition(({ positionMs, sentenceIdx }) => {
      store.setState({ positionMs, sentenceIdx });
      const chapter = store.getState().nowPlaying;
      if (chapter && sentenceIdx >= 0) {
        saver.push({
          chapterId: chapter.chapterId,
          chapterOrder: chapter.chapterOrder,
          sentenceIdx,
        });
      }
    }),
    engine.onState((next) => {
      store.setState({ state: next });
      if (next === 'paused' || next === 'ended' || next === 'error') {
        saver.flush();
      }
      if (next === 'ended' && store.getState().sleepTimer.mode === 'endOfChapter') {
        endSleepTimer();
      }
    }),
  ];

  const actions: PlayerActions = {
    async load(chapter, startMs = 0) {
      saver.flush();
      durationMs = chapter.segments.reduce((sum, segment) => sum + segment.durationMs, 0);
      final = chapter.final;
      store.setState({
        nowPlaying: {
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          title: chapter.title,
          seriesTitle: chapter.seriesTitle,
          coverUri: chapter.coverUri,
        },
        positionMs: startMs,
        sentenceIdx: -1,
        state: 'loading',
      });
      await engine.load(chapter, startMs);
    },

    appendSegments(segments, nextFinal) {
      durationMs += segments.reduce((sum, segment) => sum + segment.durationMs, 0);
      final = nextFinal;
      engine.appendSegments(segments, nextFinal);
    },

    play() {
      engine.play();
    },

    pause() {
      engine.pause();
    },

    togglePlay() {
      const { state } = store.getState();
      if (state === 'playing' || state === 'buffering') engine.pause();
      else engine.play();
    },

    seekTo(ms) {
      engine.seekTo(ms);
    },

    setRate(rate) {
      if (!(rate >= MIN_RATE && rate <= MAX_RATE)) {
        throw new RangeError(`rate must be between ${MIN_RATE} and ${MAX_RATE}, got ${rate}`);
      }
      engine.setRate(rate);
      store.setState({ rate });
    },

    setSleepTimer(request) {
      if (request.mode === 'off') {
        endSleepTimer();
        return;
      }
      const timer =
        request.mode === 'minutes'
          ? minutesSleepTimer(now(), request.minutes)
          : END_OF_CHAPTER_SLEEP_TIMER;
      store.setState({ sleepTimer: timer });
      if (sleepTicker === null) {
        sleepTicker = timers.setInterval(sleepTick, SLEEP_TICK_MS);
      }
    },

    flushPosition() {
      saver.flush();
    },

    dispose() {
      stopSleepTicker();
      for (const unsubscribe of unsubscribes) unsubscribe();
      saver.dispose();
      engine.dispose();
    },
  };

  return {
    ...actions,
    usePlayerState: store,
    getState: () => store.getState(),
  };
}
