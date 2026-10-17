import { create, type StoreApi, type UseBoundStore } from 'zustand';

import type { AudioEngine, ChapterLoad, LoadedSegment } from '@/audio/engine';
import type {
  AmbienceCue,
  AudioSegment,
  ChapterStatus,
  Paragraph,
  PlaybackPoint,
  Sentence,
} from '@/core/domain';
import { DEFAULT_BED_LEVEL_DB } from '@/core/playback/ambience-scheduler';
import { buildTimeline, type ChapterTimeline } from '@/core/playback/timeline';
import type { ChapterForPlayback } from '@/db/repos/playback-repo';
import type { ChapterProgress, PipelineFacade } from '@/features/pipeline/facade';

import { createPlayerStore, type PlayerStore, type PlayerTimers } from './player-store';
import { containsMs, sentenceRange } from './sentence-range';

import type { PlaybackData } from './playback-data';

/** Bed levels the engine accepts. */
const MIN_BED_LEVEL_DB = -40;
const MAX_BED_LEVEL_DB = 0;
/** Going back within this many ms of a sentence start restarts that sentence instead of stepping back. */
const RESTART_SENTENCE_MS = 2000;
/** How long a settings sample of one bed plays. */
export const BED_PREVIEW_MS = 8000;

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface AmbienceSettings {
  /** The master switch for every bed. */
  enabled: boolean;
  /** Bed level relative to the narration, from -40 to 0 dB. */
  levelDb: number;
}

/** What the player UI renders for the chapter in view. The store is separate from the engine's. */
export interface PlaybackContent {
  status: PlaybackStatus;
  chapterId: string | null;
  seriesId: string | null;
  coverTint: string | null;
  /** False while narration is still being generated. */
  final: boolean;
  /** The estimated length of the whole narration while it is being generated, else null. */
  estimatedTotalMs: number | null;
  paragraphs: readonly Paragraph[];
  sentences: readonly Sentence[];
  cues: readonly AmbienceCue[];
  /** Null until the chapter has audio. Covers only the segments that have arrived. */
  timeline: ChapterTimeline | null;
  /** The sentence on repeat (A-B loop on one sentence), or null. */
  loopSentenceIdx: number | null;
  ambience: AmbienceSettings;
}

const INITIAL_CONTENT: PlaybackContent = {
  status: 'idle',
  chapterId: null,
  seriesId: null,
  coverTint: null,
  final: true,
  estimatedTotalMs: null,
  paragraphs: [],
  sentences: [],
  cues: [],
  timeline: null,
  loopSentenceIdx: null,
  ambience: { enabled: true, levelDb: DEFAULT_BED_LEVEL_DB },
};

export interface PlayChapterOptions {
  /** Start at this sentence instead of the saved position. */
  fromSentence?: number;
}

export interface PlaybackControllerDeps {
  data: PlaybackData;
  engine: AudioEngine;
  pipeline: Pick<PipelineFacade, 'subscribe'>;
  timers?: PlayerTimers;
  now?: () => number;
}

export interface PlaybackController {
  /** Playback state and transport actions. Components read it through its hook. */
  readonly player: PlayerStore;
  /** Content of the chapter in view, read through its hook. */
  readonly content: UseBoundStore<StoreApi<PlaybackContent>>;
  /** Loads a chapter, resuming the saved position when it is the one last played. Never throws. */
  playChapter(chapterId: string, options?: PlayChapterOptions): Promise<void>;
  /** A user seek to a sentence. Ends a repeat unless the sentence is the one repeating. */
  seekToSentence(idx: number): void;
  /** A user seek in media ms. Ends a repeat when the target leaves the repeated sentence. */
  seekToMs(ms: number): void;
  seekBy(deltaMs: number): void;
  /** Next sentence, or back: the start of this sentence when more than 2 s in, else the previous one. */
  stepSentence(direction: 'next' | 'previous'): void;
  /** Repeats one sentence until it is set to null or the listener seeks out of it. */
  setLoopSentence(idx: number | null): void;
  setAmbience(patch: Partial<AmbienceSettings>): void;
  /** Plays one ambience bed for a few seconds at `levelDb`, for the settings sample. */
  previewBed(category: string, levelDb: number): void;
  dispose(): void;
}

/** A chapter whose narration has finished, whatever it produced. */
function isNarrationComplete(status: ChapterStatus): boolean {
  return status === 'ready' || status === 'failed';
}

/**
 * A chapter whose narration is still to come: queued, running, or waiting for a connection to retry
 * (BG1). The player keeps following it, so audio that arrives later is still picked up.
 */
function isNarrating(state: ChapterProgress['state']): boolean {
  return state === 'queued' || state === 'running' || state === 'waiting';
}

/** The analysis is settled once its stage is done or skipped: its cues are in the database by then. */
function isAnalysisSettled(progress: ChapterProgress): boolean {
  return progress.stages.some(
    (stage) => stage.stage === 'analyze' && (stage.status === 'done' || stage.status === 'skipped'),
  );
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

/**
 * Wires the audio engine, the player store, the database and the pipeline together. It loads
 * chapters, resumes them, advances to the next ready chapter, appends narration as it arrives,
 * and enforces repeats. It holds no native or React code, so it runs under Jest.
 */
export function createPlaybackController(deps: PlaybackControllerDeps): PlaybackController {
  const { data, engine, pipeline } = deps;
  const useContent = create<PlaybackContent>()(() => INITIAL_CONTENT);
  const readContent = () => useContent.getState();
  const writeContent = (patch: Partial<PlaybackContent>) => useContent.setState(patch);

  let seriesId: string | null = null;
  let segments: LoadedSegment[] = [];
  let loadToken = 0;
  let stopWatching: (() => void) | null = null;

  // Registered before the player store, so the auto-advance sees a still-set end-of-chapter timer.
  const unsubscribes: (() => void)[] = [
    engine.onState((state) => {
      if (state === 'ended') handleEnded();
    }),
    engine.onPosition(({ positionMs }) => enforceRepeat(positionMs)),
  ];

  const player = createPlayerStore({
    engine,
    savePosition: savePositionSafely,
    timers: deps.timers,
    now: deps.now,
  });

  function savePositionSafely(point: PlaybackPoint): void {
    if (seriesId === null) return;
    try {
      data.savePosition(seriesId, point.chapterId, point.sentenceIdx);
    } catch (error) {
      // Position saves are best effort. The next tick saves again, so a failure is not fatal.
      console.warn('Could not save the listening position.', error);
    }
  }

  function enforceRepeat(positionMs: number): void {
    const { loopSentenceIdx, timeline } = readContent();
    if (loopSentenceIdx === null || !timeline) return;
    const range = sentenceRange(timeline, loopSentenceIdx);
    if (range && positionMs >= range.endMs) engine.seekTo(range.startMs);
  }

  function handleEnded(): void {
    const { loopSentenceIdx, timeline } = readContent();
    const range =
      loopSentenceIdx !== null && timeline ? sentenceRange(timeline, loopSentenceIdx) : null;
    if (range) {
      // play() first: after an end, the engine treats a play as a restart from zero.
      engine.play();
      engine.seekTo(range.startMs);
      return;
    }
    if (player.getState().sleepTimer.mode === 'endOfChapter') return;
    advanceToNext();
  }

  function advanceToNext(): void {
    const current = player.getState().nowPlaying;
    if (!current || seriesId === null) return;
    const nextId = data.nextReadyChapterId(seriesId, current.chapterOrder);
    if (nextId !== null) void playChapter(nextId);
  }

  function stopWatchingProgress(): void {
    stopWatching?.();
  }

  /**
   * Follows the pipeline while a chapter is still narrating. New segments are appended as they
   * arrive, and the end of narration is passed to the engine so playback can finish.
   */
  function watchProgress(chapterId: string): void {
    stopWatchingProgress();
    let active = true;
    let cuesReloaded = false;
    let unsubscribe: (() => void) | null = null;
    const stop = () => {
      active = false;
      unsubscribe?.();
      if (stopWatching === stop) stopWatching = null;
      writeContent({ estimatedTotalMs: null });
    };
    stopWatching = stop;

    unsubscribe = pipeline.subscribe(chapterId, (progress) => {
      if (!active) return;
      const narrating = isNarrating(progress.state);
      if (readContent().status === 'unavailable') {
        // Nothing was playable when the chapter opened: start it once narration produces audio.
        if (data.segmentsFrom(chapterId, 0).length > 0) {
          stop();
          void playChapter(chapterId);
        } else if (!narrating) {
          stop();
        }
        return;
      }
      if (!cuesReloaded && isAnalysisSettled(progress)) {
        cuesReloaded = true;
        reloadCues(chapterId);
      }
      if (progress.readySegments > segments.length || !narrating) {
        appendFromData(chapterId, !narrating);
      }
      if (!narrating) {
        stop();
        return;
      }
      writeContent({ estimatedTotalMs: progress.estimatedTotalMs });
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

  /** Analysis finished after the audio started: the cues are read again and reach the engine live. */
  function reloadCues(chapterId: string): void {
    if (readContent().chapterId !== chapterId) return;
    const chapter = data.loadChapter(chapterId);
    if (chapter === null) return;
    writeContent({ cues: chapter.cues });
    engine.setCues(chapter.cues);
  }

  function resumeSentence(chapterId: string): number {
    if (seriesId === null) return 0;
    const saved = data.currentPoint(seriesId);
    return saved?.chapterId === chapterId ? saved.sentenceIdx : 0;
  }

  async function playChapter(chapterId: string, options: PlayChapterOptions = {}): Promise<void> {
    const token = ++loadToken;
    // Save the outgoing position while its series is still the current one.
    player.flushPosition();
    stopWatchingProgress();
    player.pause();
    writeContent({
      status: 'loading',
      chapterId,
      paragraphs: [],
      sentences: [],
      cues: [],
      timeline: null,
      loopSentenceIdx: null,
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

      const { ambience } = readContent();
      engine.setAmbienceMaster(ambience.enabled, ambience.levelDb);
      writeContent({ ...shared, status: 'ready', timeline, final });
      if (!final) watchProgress(chapterId);
    } catch (error) {
      if (token === loadToken) {
        console.warn('Could not start the chapter.', error);
        writeContent({ status: 'error', chapterId });
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
    };
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

    setLoopSentence(idx) {
      const { timeline } = readContent();
      if (idx === null || !timeline) {
        writeContent({ loopSentenceIdx: null });
        return;
      }
      const range = sentenceRange(timeline, idx);
      if (!range) return;
      writeContent({ loopSentenceIdx: idx });
      if (!containsMs(range, player.getState().positionMs)) player.seekTo(range.startMs);
    },

    setAmbience(patch) {
      const current = readContent().ambience;
      const next = {
        enabled: patch.enabled ?? current.enabled,
        levelDb: clamp(patch.levelDb ?? current.levelDb, MIN_BED_LEVEL_DB, MAX_BED_LEVEL_DB),
      };
      writeContent({ ambience: next });
      engine.setAmbienceMaster(next.enabled, next.levelDb);
    },

    previewBed(category, levelDb) {
      engine.previewBed(
        category,
        clamp(levelDb, MIN_BED_LEVEL_DB, MAX_BED_LEVEL_DB),
        BED_PREVIEW_MS,
      );
    },

    dispose() {
      loadToken++;
      stopWatchingProgress();
      for (const unsubscribe of unsubscribes) unsubscribe();
      player.dispose();
    },
  };
}
