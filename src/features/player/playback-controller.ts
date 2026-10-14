import { create, type StoreApi, type UseBoundStore } from 'zustand';

import type { AudioEngine, ChapterLoad, LoadedSegment, PlaybackState } from '@/audio/engine';
import type {
  AmbienceCue,
  AudioSegment,
  Bookmark,
  ChapterStatus,
  Paragraph,
  Sentence,
} from '@/core/domain';
import { DEFAULT_BED_LEVEL_DB } from '@/core/playback/ambience-scheduler';
import { DUCKING_DEFAULTS } from '@/core/playback/ducking';
import {
  BED_LEVEL_RANGE_DB,
  DUCKING_RANGE_DB,
  PLAYBACK_RATE_RANGE,
  clampToRange,
} from '@/core/playback/ranges';
import { buildTimeline, type ChapterTimeline } from '@/core/playback/timeline';
import { systemTimers } from '@/core/playback/timers';
import type { ChapterForPlayback } from '@/db/repos/playback-repo';
import { findBookmark, type BookmarkGroup } from '@/features/bookmarks/bookmark-data';
import type { ChapterProgress, PipelineFacade } from '@/features/pipeline/facade';

import {
  createPlayerStore,
  type PlayerStore,
  type PlayerTimers,
  type SavedPosition,
} from './player-store';
import { containsMs, sentenceRange } from './sentence-range';

import type { PlaybackData } from './playback-data';
import type { SampleOutput, SampleRequest } from './sample-output';

/** How long a settings sample of one bed plays. */
export const BED_PREVIEW_MS = 8000;
/** Going back within this many ms of a sentence start restarts that sentence instead of stepping back. */
const RESTART_SENTENCE_MS = 2000;

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

/** Why a chapter could not play. A load failure is about the stored chapter, a playback one about the audio. */
export type PlaybackFailure = 'load' | 'playback';

export interface AmbienceSettings {
  /** The master switch for every bed. */
  enabled: boolean;
  /** Bed level relative to the narration, in dB (BED_LEVEL_RANGE_DB). */
  levelDb: number;
  /** How far beds dip under the voice, in dB (DUCKING_RANGE_DB). */
  duckingDb: number;
}

/** What the player UI renders for the chapter in view. The store is separate from the engine's. */
export interface PlaybackContent {
  status: PlaybackStatus;
  chapterId: string | null;
  seriesId: string | null;
  coverTint: string | null;
  /** False while narration is still being generated. Only a finished or failed narration is final. */
  final: boolean;
  /** True when processing has stopped before the chapter was finished, so its audio ends here for now. */
  narrationPaused: boolean;
  /** Set with `status: 'error'`: which failure to explain. */
  failure: PlaybackFailure | null;
  paragraphs: readonly Paragraph[];
  sentences: readonly Sentence[];
  cues: readonly AmbienceCue[];
  /** Null until the chapter has audio. Covers only the segments that have arrived. */
  timeline: ChapterTimeline | null;
  /** The sentence on repeat (A-B loop on one sentence), or null. */
  loopSentenceIdx: number | null;
  ambience: AmbienceSettings;
  /** The series' bookmarks, by chapter in reading order. Empty when no series is loaded. */
  bookmarks: readonly BookmarkGroup[];
}

/** The result of bookmarking the current sentence: a new bookmark, or one removed again. */
export type BookmarkToggle = { kind: 'added'; bookmark: Bookmark } | { kind: 'removed' };

/** The saved ambience settings, read and written by the controller. Production wires it to settings. */
export interface AmbiencePort {
  read(): AmbienceSettings;
  write(next: AmbienceSettings): void;
  subscribe(listener: (next: AmbienceSettings) => void): () => void;
}

export interface PlaybackSampleState {
  /** True while a sample plays and the narration is held. */
  playing: boolean;
}

const INITIAL_AMBIENCE: AmbienceSettings = {
  enabled: true,
  levelDb: DEFAULT_BED_LEVEL_DB,
  duckingDb: DUCKING_DEFAULTS.duckingDb,
};

const INITIAL_CONTENT: PlaybackContent = {
  status: 'idle',
  chapterId: null,
  seriesId: null,
  coverTint: null,
  final: true,
  narrationPaused: false,
  failure: null,
  paragraphs: [],
  sentences: [],
  cues: [],
  timeline: null,
  loopSentenceIdx: null,
  ambience: INITIAL_AMBIENCE,
  bookmarks: [],
};

export interface PlayChapterOptions {
  /** Start at this sentence instead of the saved position. */
  fromSentence?: number;
  /** Start playing once the chapter is loaded. Auto-advance uses it, so listening carries on. */
  autoplay?: boolean;
}

export interface PlaybackControllerDeps {
  data: PlaybackData;
  engine: AudioEngine;
  pipeline: Pick<PipelineFacade, 'subscribe'>;
  ambience: AmbiencePort;
  samples: SampleOutput;
  /** The speed for a series that has none saved yet. Read when a chapter loads. */
  defaultRate: () => number;
  timers?: PlayerTimers;
  now?: () => number;
}

export interface PlaybackController {
  /** Playback state and transport actions. Components read it through its hook. */
  readonly player: PlayerStore;
  /** Content of the chapter in view, read through its hook. */
  readonly content: UseBoundStore<StoreApi<PlaybackContent>>;
  /** Whether a sample is playing, read through its hook. */
  readonly sample: UseBoundStore<StoreApi<PlaybackSampleState>>;
  /**
   * Loads a chapter at its own saved place, or from the start when it was finished. Never throws.
   * The series' saved speed applies once it is ready.
   */
  playChapter(chapterId: string, options?: PlayChapterOptions): Promise<void>;
  /** Plays a bookmark or any other sentence: seeks in the chapter in view, or loads it first. */
  jumpToSentence(chapterId: string, sentenceIdx: number): void;
  /** A user seek to a sentence. Ends a repeat unless the sentence is the one repeating. */
  seekToSentence(idx: number): void;
  /** A user seek in media ms. Ends a repeat when the target leaves the repeated sentence. */
  seekToMs(ms: number): void;
  seekBy(deltaMs: number): void;
  /** Next sentence, or back: the start of this sentence when more than 2 s in, else the previous one. */
  stepSentence(direction: 'next' | 'previous'): void;
  /** Repeats one sentence until it is set to null or the listener seeks out of it. */
  setLoopSentence(idx: number | null): void;
  /** Remembers the current speed for this series, so its chapters load at it from now on. */
  saveRateForSeries(): void;
  /** Bookmarks a sentence of the chapter in view, or removes its bookmark. Null when neither can happen. */
  toggleBookmark(sentenceIdx: number): BookmarkToggle | null;
  /** Saves the note of a bookmark, then refreshes the list. */
  saveBookmarkNote(bookmarkId: string, note: string): void;
  deleteBookmark(bookmarkId: string): void;
  setAmbience(patch: Partial<AmbienceSettings>): void;
  /** Plays one ambience bed for a few seconds at `levelDb`, for the settings sample. */
  previewBed(category: string, levelDb: number): void;
  /**
   * Plays a sample (a narrator's clip or a device voice line). The narration is paused for it and
   * resumed afterwards if it was playing. A second sample replaces the first.
   */
  playSample(request: SampleRequest): void;
  /** Stops the sample and resumes the narration if it had been playing. */
  stopSample(): void;
  dispose(): void;
}

/** A chapter whose narration has finished for good: its last segment exists and nothing more is coming. */
function isNarrationComplete(state: ChapterStatus | ChapterProgress['state']): boolean {
  return state === 'ready' || state === 'failed';
}

/** Processing that has stopped on its own, and that the listener may want to restart. */
function isProcessingStopped(state: ChapterProgress['state']): boolean {
  return state === 'idle' || state === 'cancelled';
}

function toLoadedSegment(segment: AudioSegment): LoadedSegment {
  return {
    uri: segment.fileUri,
    durationMs: segment.durationMs,
    sentenceStart: segment.sentenceStart,
    sentenceEnd: segment.sentenceEnd,
    sentenceOffsetsMs: segment.sentenceOffsetsMs,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sameAmbience(a: AmbienceSettings, b: AmbienceSettings): boolean {
  return a.enabled === b.enabled && a.levelDb === b.levelDb && a.duckingDb === b.duckingDb;
}

/**
 * Wires the audio engine, the player store, the database, the pipeline and the sample output
 * together. It loads chapters, resumes them, advances to the next ready chapter, appends narration
 * as it arrives, enforces repeats, and applies the saved ambience settings. It holds no native or
 * React code, so it runs under Jest.
 */
export function createPlaybackController(deps: PlaybackControllerDeps): PlaybackController {
  const { data, engine, pipeline, ambience, samples } = deps;
  const timers = deps.timers ?? systemTimers;
  const initialAmbience = ambience.read();
  const useContent = create<PlaybackContent>()(() => ({
    ...INITIAL_CONTENT,
    ambience: initialAmbience,
  }));
  const useSample = create<PlaybackSampleState>()(() => ({ playing: false }));
  const readContent = () => useContent.getState();
  const writeContent = (patch: Partial<PlaybackContent>) => useContent.setState(patch);

  let seriesId: string | null = null;
  let segments: LoadedSegment[] = [];
  let loadToken = 0;
  let stopWatching: (() => void) | null = null;
  let repeatTimer: unknown = null;
  let sampleActive = false;
  let resumeAfterSample = false;
  let sampleToken = 0;

  engine.setAmbienceMix(initialAmbience);

  // Registered before the player store, so the end of a chapter is read before the store's own
  // listener clears the sleep timer.
  const unsubscribes: (() => void)[] = [
    engine.onState(handleEngineState),
    engine.onPosition(({ positionMs }) => enforceRepeat(positionMs)),
    ambience.subscribe((next) => applyAmbience(next)),
  ];

  const player = createPlayerStore({
    engine,
    savePosition: savePositionSafely,
    timers,
    now: deps.now,
  });

  function savePositionSafely(point: SavedPosition): void {
    if (seriesId === null) return;
    try {
      data.savePosition(seriesId, point.chapterId, {
        sentenceIdx: point.sentenceIdx,
        positionMs: point.positionMs,
      });
    } catch (error) {
      // Position saves are best effort. The next tick saves again, so a failure is not fatal.
      console.warn('Could not save the listening position.', error);
    }
  }

  function handleEngineState(state: PlaybackState): void {
    if (state === 'error') {
      // A failure while the chapter is in view replaces it with the error state. Its place is saved
      // by the player store, so "Try again" resumes there.
      if (readContent().status === 'ready') writeContent({ status: 'error', failure: 'playback' });
      return;
    }
    if (state === 'ended') {
      // Read the sleep timer now, before the store clears it. The advance itself runs after the
      // engine has finished telling its listeners, so the store never sees a stale `ended`.
      const stopAtChapterEnd = player.getState().sleepTimer.mode === 'endOfChapter';
      void Promise.resolve().then(() => handleEnded(stopAtChapterEnd));
    }
  }

  function applyAmbience(next: AmbienceSettings): void {
    if (sameAmbience(readContent().ambience, next)) return;
    writeContent({ ambience: next });
    engine.setAmbienceMix(next);
  }

  function clearRepeatTimer(): void {
    if (repeatTimer !== null) {
      timers.clearTimeout(repeatTimer);
      repeatTimer = null;
    }
  }

  /**
   * Keeps a repeated sentence repeating. The jump is scheduled from the predicted end, adjusted
   * for the rate, so it lands on the boundary. The position event is the backstop when it is late.
   */
  function enforceRepeat(positionMs: number): void {
    clearRepeatTimer();
    const { loopSentenceIdx, timeline } = readContent();
    if (loopSentenceIdx === null || !timeline) return;
    const range = sentenceRange(timeline, loopSentenceIdx);
    if (!range) return;
    if (positionMs >= range.endMs) {
      engine.seekTo(range.startMs);
      return;
    }
    const delayMs = (range.endMs - positionMs) / player.getState().rate;
    repeatTimer = timers.setTimeout(() => {
      repeatTimer = null;
      if (readContent().loopSentenceIdx === loopSentenceIdx) engine.seekTo(range.startMs);
    }, delayMs);
  }

  function handleEnded(stopAtChapterEnd: boolean): void {
    const { loopSentenceIdx, timeline } = readContent();
    const range =
      loopSentenceIdx !== null && timeline ? sentenceRange(timeline, loopSentenceIdx) : null;
    if (range) {
      // play() first: after an end, the engine treats a play as a restart from zero.
      engine.play();
      engine.seekTo(range.startMs);
      return;
    }
    markChapterFinished(readContent().chapterId, timeline);
    if (stopAtChapterEnd) return;
    advanceToNext();
  }

  /** Records that the chapter was heard to its end, so it reads as finished and restarts from the top. */
  function markChapterFinished(chapterId: string | null, timeline: ChapterTimeline | null): void {
    if (chapterId === null || timeline === null || timeline.sentenceCount === 0) return;
    try {
      data.markFinished(chapterId, {
        sentenceIdx: timeline.sentenceCount - 1,
        positionMs: timeline.totalDurationMs,
      });
    } catch (error) {
      console.warn('Could not mark the chapter as finished.', error);
    }
  }

  function advanceToNext(): void {
    const current = player.getState().nowPlaying;
    if (!current || seriesId === null) return;
    const nextId = data.nextReadyChapterId(seriesId, current.chapterOrder);
    if (nextId !== null) void playChapter(nextId, { autoplay: true });
  }

  function stopWatchingProgress(): void {
    stopWatching?.();
  }

  /**
   * Follows the pipeline while a chapter is still narrating. New segments are appended as they
   * arrive. Only a finished or failed narration makes the chapter final. Every other state keeps
   * the watch open, so a stall or a reconnect resumes on its own.
   */
  function watchProgress(chapterId: string): void {
    stopWatchingProgress();
    let active = true;
    let unsubscribe: (() => void) | null = null;
    const stop = () => {
      active = false;
      unsubscribe?.();
      if (stopWatching === stop) stopWatching = null;
    };
    stopWatching = stop;

    unsubscribe = pipeline.subscribe(chapterId, (progress) => {
      if (!active) return;
      const complete = isNarrationComplete(progress.state);
      if (readContent().status === 'unavailable') {
        // Nothing was playable when the chapter opened: start it once narration produces audio.
        if (data.segmentsFrom(chapterId, 0).length > 0) {
          stop();
          void playChapter(chapterId);
        } else if (complete) {
          stop();
        }
        return;
      }
      if (progress.readySegments > segments.length || complete) {
        appendFromData(chapterId, complete);
      }
      writeContent({ narrationPaused: !complete && isProcessingStopped(progress.state) });
      if (complete) stop();
    });
    // The subscribe call emits the current snapshot at once, which may have stopped the watch already.
    if (!active) unsubscribe();
  }

  function appendFromData(chapterId: string, final: boolean): void {
    const fresh = data.segmentsFrom(chapterId, segments.length).map(toLoadedSegment);
    if (fresh.length === 0 && !final) return;
    segments = [...segments, ...fresh];
    player.appendSegments(fresh, final);
    writeContent({ timeline: buildTimeline(segments), final });
  }

  /** A chapter resumes at its own saved sentence. A finished one starts from the top. */
  function resumeSentence(chapterId: string): number {
    const saved = data.chapterPosition(chapterId);
    return saved !== null && !saved.completed ? saved.sentenceIdx : 0;
  }

  /** The series' saved speed, or the default for a series that has none, kept inside the range. */
  function rateFor(chapterSeriesId: string): number {
    const saved = data.seriesPlaybackRate(chapterSeriesId) ?? deps.defaultRate();
    return clampToRange(saved, PLAYBACK_RATE_RANGE);
  }

  /** Ends the sample. Resumes the narration only when it was held for the sample and asked to resume. */
  function endSample(resume: boolean): void {
    if (!sampleActive) return;
    sampleToken += 1;
    samples.stop();
    sampleActive = false;
    useSample.setState({ playing: false });
    const shouldResume = resumeAfterSample && resume;
    resumeAfterSample = false;
    if (shouldResume) player.play();
  }

  async function playChapter(chapterId: string, options: PlayChapterOptions = {}): Promise<void> {
    const token = ++loadToken;
    // Save the outgoing position while its series is still the current one.
    player.flushPosition();
    stopWatchingProgress();
    player.pause();
    endSample(false);
    writeContent({
      status: 'loading',
      chapterId,
      paragraphs: [],
      sentences: [],
      cues: [],
      timeline: null,
      loopSentenceIdx: null,
      narrationPaused: false,
      failure: null,
    });

    try {
      const chapter = data.loadChapter(chapterId);
      if (chapter === null) {
        writeContent({ status: 'unavailable', chapterId });
        return;
      }
      seriesId = chapter.chapter.seriesId;
      const loaded = chapter.segments.map(toLoadedSegment);
      const timeline = buildTimeline(loaded);
      const final = isNarrationComplete(chapter.chapter.status);
      const shared = sharedContent(chapter, chapterId);

      segments = loaded;
      applyAmbience(ambience.read());
      if (loaded.length === 0) {
        writeContent({ ...shared, status: 'unavailable', final: false });
        if (!final) watchProgress(chapterId);
        return;
      }

      const startIdx = clamp(
        options.fromSentence ?? resumeSentence(chapterId),
        0,
        Math.max(0, timeline.sentenceCount - 1),
      );
      const startMs = timeline.sentenceCount > 0 ? timeline.sentenceToPosition(startIdx) : 0;
      const load: ChapterLoad = {
        id: chapter.chapter.id,
        order: chapter.chapter.order,
        title: chapter.chapter.title,
        seriesTitle: chapter.series.title,
        coverUri: chapter.series.coverUri,
        segments: loaded,
        final,
        cues: chapter.cues,
      };
      await player.load(load, startMs);
      if (token !== loadToken) return;

      player.setRate(rateFor(chapter.chapter.seriesId));
      writeContent({ ...shared, status: 'ready', timeline, final });
      if (options.autoplay) player.play();
      if (!final) watchProgress(chapterId);
    } catch (error) {
      if (token === loadToken) {
        console.warn('Could not start the chapter.', error);
        writeContent({ status: 'error', chapterId, failure: 'load' });
      }
    }
  }

  function sharedContent(chapter: ChapterForPlayback, chapterId: string): Partial<PlaybackContent> {
    return {
      chapterId,
      seriesId: chapter.chapter.seriesId,
      coverTint: chapter.series.coverTint,
      paragraphs: chapter.paragraphs,
      sentences: chapter.sentences,
      cues: chapter.cues,
      loopSentenceIdx: null,
      bookmarks: data.bookmarksOf(chapter.chapter.seriesId),
    };
  }

  function refreshBookmarks(): void {
    const { seriesId: current } = readContent();
    writeContent({ bookmarks: current === null ? [] : data.bookmarksOf(current) });
  }

  function seekToSentence(idx: number): void {
    const { timeline, loopSentenceIdx } = readContent();
    if (!timeline || !timeline.isSentenceAvailable(idx)) return;
    if (loopSentenceIdx !== null && loopSentenceIdx !== idx)
      writeContent({ loopSentenceIdx: null });
    player.seekTo(timeline.sentenceToPosition(idx));
  }

  function seekToMs(ms: number): void {
    const { timeline, loopSentenceIdx } = readContent();
    if (!timeline) return;
    const target = clamp(ms, 0, timeline.totalDurationMs);
    if (loopSentenceIdx !== null) {
      const range = sentenceRange(timeline, loopSentenceIdx);
      if (!range || !containsMs(range, target)) writeContent({ loopSentenceIdx: null });
    }
    player.seekTo(target);
  }

  return {
    player,
    content: useContent,
    sample: useSample,

    playChapter,

    seekToSentence,

    seekToMs,

    seekBy(deltaMs) {
      seekToMs(player.getState().positionMs + deltaMs);
    },

    stepSentence(direction) {
      const { timeline } = readContent();
      const { positionMs, sentenceIdx } = player.getState();
      if (!timeline || sentenceIdx < 0) return;
      if (direction === 'next') {
        seekToSentence(sentenceIdx + 1);
        return;
      }
      const start = timeline.sentenceToPosition(sentenceIdx);
      if (positionMs - start > RESTART_SENTENCE_MS || sentenceIdx === 0) {
        seekToMs(start);
      } else {
        seekToSentence(sentenceIdx - 1);
      }
    },

    jumpToSentence(chapterId, sentenceIdx) {
      const { chapterId: inView, status } = readContent();
      if (chapterId === inView && status === 'ready') {
        seekToSentence(sentenceIdx);
        player.play();
        return;
      }
      void playChapter(chapterId, { fromSentence: sentenceIdx, autoplay: true });
    },

    saveRateForSeries() {
      if (seriesId === null) return;
      data.saveSeriesPlaybackRate(seriesId, player.getState().rate);
    },

    setLoopSentence(idx) {
      const { timeline } = readContent();
      if (idx === null || !timeline) {
        clearRepeatTimer();
        writeContent({ loopSentenceIdx: null });
        return;
      }
      const range = sentenceRange(timeline, idx);
      if (!range) return;
      writeContent({ loopSentenceIdx: idx });
      if (!containsMs(range, player.getState().positionMs)) player.seekTo(range.startMs);
    },

    toggleBookmark(sentenceIdx) {
      const { chapterId, seriesId: series, timeline, bookmarks } = readContent();
      if (chapterId === null || series === null || !timeline) return null;
      if (!timeline.isSentenceAvailable(sentenceIdx)) return null;
      const existing = findBookmark(bookmarks, chapterId, sentenceIdx);
      if (existing !== null) {
        data.removeBookmark(existing.id);
        refreshBookmarks();
        return { kind: 'removed' };
      }
      const bookmark = data.addBookmark({
        seriesId: series,
        chapterId,
        sentenceIdx,
        positionMs: timeline.sentenceToPosition(sentenceIdx),
      });
      refreshBookmarks();
      return { kind: 'added', bookmark };
    },

    saveBookmarkNote(bookmarkId, note) {
      data.setBookmarkNote(bookmarkId, note);
      refreshBookmarks();
    },

    deleteBookmark(bookmarkId) {
      data.removeBookmark(bookmarkId);
      refreshBookmarks();
    },

    setAmbience(patch) {
      const current = readContent().ambience;
      const next: AmbienceSettings = {
        enabled: patch.enabled ?? current.enabled,
        levelDb: clampToRange(patch.levelDb ?? current.levelDb, BED_LEVEL_RANGE_DB),
        duckingDb: clampToRange(patch.duckingDb ?? current.duckingDb, DUCKING_RANGE_DB),
      };
      // The saved settings are the source of truth. Writing them also applies them to the engine.
      ambience.write(next);
      applyAmbience(next);
    },

    previewBed(category, levelDb) {
      engine.previewBed(category, clampToRange(levelDb, BED_LEVEL_RANGE_DB), BED_PREVIEW_MS);
    },

    playSample(request) {
      if (!sampleActive) {
        const { state } = player.getState();
        resumeAfterSample = state === 'playing' || state === 'buffering';
        if (resumeAfterSample) player.pause();
      }
      sampleActive = true;
      const token = ++sampleToken;
      useSample.setState({ playing: true });
      samples.play(request, () => {
        if (token !== sampleToken) return;
        sampleActive = false;
        useSample.setState({ playing: false });
        const shouldResume = resumeAfterSample;
        resumeAfterSample = false;
        if (shouldResume) player.play();
      });
    },

    stopSample() {
      endSample(true);
    },

    dispose() {
      loadToken += 1;
      stopWatchingProgress();
      clearRepeatTimer();
      endSample(false);
      for (const unsubscribe of unsubscribes) unsubscribe();
      player.dispose();
      samples.dispose();
    },
  };
}
