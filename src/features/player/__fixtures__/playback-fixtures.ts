import { createFakeEngine, type FakeAudioEngine } from '@/audio/fake-engine';
import type {
  AmbienceCue,
  Bookmark,
  Chapter,
  ChapterPosition,
  ChapterStatus,
  Sentence,
  Series,
} from '@/core/domain';
import type { VirtualTimers } from '@/core/playback/timers';
import type { ChapterForPlayback } from '@/db/repos/playback-repo';
import type { BookmarkGroup } from '@/features/bookmarks/bookmark-data';
import type { ChapterProgress, PipelineFacade } from '@/features/pipeline/facade';

import {
  createPlaybackController,
  type AmbiencePort,
  type AmbienceSettings,
  type PlaybackController,
} from '../playback-controller';

import type { PlaybackData } from '../playback-data';
import type { SampleOutput, SampleRequest } from '../sample-output';

export const SERIES_ID = 'S';
export const PROFILE = 'P';
export const id = (n: number) => `${n}`.padStart(26, '0');

export const SEGMENT_ONE = {
  id: id(101),
  chapterId: id(1),
  idx: 0,
  sentenceStart: 0,
  sentenceEnd: 1,
  fileUri: 'file:///one.m4a',
  durationMs: 4000,
  sentenceOffsetsMs: [0, 2000],
  profileId: PROFILE,
  inputHash: 'h0',
};
export const SEGMENT_TWO = {
  id: id(102),
  chapterId: id(1),
  idx: 1,
  sentenceStart: 2,
  sentenceEnd: 3,
  fileUri: 'file:///two.m4a',
  durationMs: 6000,
  sentenceOffsetsMs: [0, 3000],
  profileId: PROFILE,
  inputHash: 'h1',
};

export function chapter(n: number, order: number, status: ChapterStatus): Chapter {
  return {
    id: id(n),
    seriesId: SERIES_ID,
    order,
    title: `Chapter ${n}`,
    source: { kind: 'text', label: 'pasted' },
    sourceLang: 'en',
    status,
    wordCount: null,
    durationMs: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function sentences(chapterN: number, count: number): Sentence[] {
  return Array.from({ length: count }, (_, idx) => ({
    chapterId: id(chapterN),
    idx,
    paragraphIdx: 0,
    text: `Sentence ${idx} of chapter ${chapterN}.`,
    translated: idx === 0 ? 'Traduit.' : null,
    charCount: 20,
  }));
}

export const SERIES: Series = {
  id: SERIES_ID,
  title: 'The Night Harbour',
  coverUri: null,
  coverTint: '#2B3A55',
  sourceLang: 'en',
  targetLang: null,
  narrationProfileId: null,
  createdAt: 0,
  updatedAt: 0,
};

export const CUE: AmbienceCue = {
  id: id(900),
  chapterId: id(1),
  category: 'harbor_port',
  startSentence: 0,
  endSentence: 1,
  intensity: 'medium',
  fadeInMs: 1000,
  fadeOutMs: 1000,
  confidence: 0.9,
  reason: 'Boats and gulls.',
  enabled: true,
};

/** A chapter's saved place, as the tests seed it. Omitted fields take the defaults. */
export interface SeededPosition {
  chapterId: string;
  sentenceIdx: number;
  positionMs?: number;
  completed?: boolean;
}

/** One position save the controller asked the data port to write. */
export interface PositionWrite {
  seriesId: string;
  chapterId: string;
  sentenceIdx: number;
  positionMs: number;
}

export interface Fixture {
  chapters: Map<string, ChapterForPlayback>;
  positions: Map<string, ChapterPosition>;
  /** Every position save, in order. */
  saved: PositionWrite[];
  /** Chapters the listener heard to the end. */
  finished: string[];
  /** The saved speed of each series. */
  rates: Map<string, number>;
  /** Every speed the controller saved for a series. */
  rateWrites: { seriesId: string; rate: number }[];
  bookmarks: Bookmark[];
}

export function fixtureChapter(
  n: number,
  order: number,
  status: ChapterStatus,
  segments: ChapterForPlayback['segments'] = [SEGMENT_ONE, SEGMENT_TWO],
): ChapterForPlayback {
  return {
    chapter: chapter(n, order, status),
    series: SERIES,
    segments,
    cues: n === 1 ? [CUE] : [],
    paragraphs: [{ idx: 0, sentenceStart: 0, sentenceEnd: 4, kind: 'text' }],
    sentences: sentences(n, 4),
  };
}

export function createData(fixture: Fixture): PlaybackData {
  return {
    loadChapter: (chapterId) => fixture.chapters.get(chapterId) ?? null,
    chapterPosition: (chapterId) => fixture.positions.get(chapterId) ?? null,
    nextReadyChapterId(_seriesId, afterOrder) {
      const next = [...fixture.chapters.values()]
        .filter((c) => c.chapter.order > afterOrder && c.chapter.status === 'ready')
        .sort((a, b) => a.chapter.order - b.chapter.order)[0];
      return next ? next.chapter.id : null;
    },
    savePosition(seriesId, chapterId, point) {
      fixture.saved.push({ seriesId, chapterId, ...point });
      fixture.positions.set(chapterId, {
        chapterId,
        ...point,
        completed: false,
        updatedAt: 0,
      });
    },
    markFinished(chapterId, point) {
      fixture.finished.push(chapterId);
      fixture.positions.set(chapterId, { chapterId, ...point, completed: true, updatedAt: 0 });
    },
    seriesPlaybackRate: (seriesId) => fixture.rates.get(seriesId) ?? null,
    saveSeriesPlaybackRate(seriesId, rate) {
      fixture.rateWrites.push({ seriesId, rate });
      fixture.rates.set(seriesId, rate);
    },
    segmentsFrom: (chapterId, fromIdx) =>
      (fixture.chapters.get(chapterId)?.segments ?? []).filter((s) => s.idx >= fromIdx),
    bookmarksOf: (seriesId) => groupBookmarks(fixture, seriesId),
    addBookmark(place) {
      const bookmark: Bookmark = {
        id: id(500 + fixture.bookmarks.length),
        ...place,
        note: null,
        createdAt: 0,
      };
      fixture.bookmarks.push(bookmark);
      return bookmark;
    },
    setBookmarkNote(bookmarkId, note) {
      fixture.bookmarks = fixture.bookmarks.map((b) => (b.id === bookmarkId ? { ...b, note } : b));
    },
    removeBookmark(bookmarkId) {
      fixture.bookmarks = fixture.bookmarks.filter((b) => b.id !== bookmarkId);
    },
  };
}

/** The bookmarks of a series in the shape the list reads, with each sentence's text as the snippet. */
function groupBookmarks(fixture: Fixture, seriesId: string): BookmarkGroup[] {
  const chapters = [...fixture.chapters.values()]
    .filter((c) => c.chapter.seriesId === seriesId)
    .sort((a, b) => a.chapter.order - b.chapter.order);
  return chapters.flatMap((c, index) => {
    const items = fixture.bookmarks
      .filter((b) => b.chapterId === c.chapter.id)
      .sort((a, b) => a.sentenceIdx - b.sentenceIdx)
      .map((b) => ({
        id: b.id,
        sentenceIdx: b.sentenceIdx,
        positionMs: b.positionMs,
        note: b.note,
        snippet: c.sentences[b.sentenceIdx]?.text ?? '',
      }));
    if (items.length === 0) return [];
    return [
      {
        chapterId: c.chapter.id,
        chapterNumber: index + 1,
        chapterTitle: c.chapter.title,
        bookmarks: items,
      },
    ];
  });
}

/** The positions a test starts from, as the saved rows the data port would return. */
export function seededPositions(seeds: readonly SeededPosition[]): Map<string, ChapterPosition> {
  return new Map(
    seeds.map((seed) => [
      seed.chapterId,
      {
        chapterId: seed.chapterId,
        sentenceIdx: seed.sentenceIdx,
        positionMs: seed.positionMs ?? 0,
        completed: seed.completed ?? false,
        updatedAt: 0,
      },
    ]),
  );
}

export function fakePipeline() {
  const listeners = new Map<string, Set<(p: ChapterProgress) => void>>();
  const latest = new Map<string, ChapterProgress>();
  const pipeline: Pick<PipelineFacade, 'subscribe'> = {
    subscribe(chapterId, listener) {
      if (!listeners.has(chapterId)) listeners.set(chapterId, new Set());
      listeners.get(chapterId)?.add(listener);
      const snapshot = latest.get(chapterId);
      if (snapshot) listener(snapshot);
      return () => listeners.get(chapterId)?.delete(listener);
    },
  };
  return {
    pipeline,
    emit(
      chapterId: string,
      state: ChapterProgress['state'],
      readySegments: number,
      overrides: Partial<ChapterProgress> = {},
    ) {
      const progress: ChapterProgress = {
        chapterId,
        state,
        stages: [],
        overall: 0,
        playable: false,
        etaMs: null,
        readySegments,
        totalSegments: null,
        narratedMs: 0,
        estimatedTotalMs: null,
        costUsdSoFar: 0,
        error: null,
        reconnecting: false,
        ...overrides,
      };
      latest.set(chapterId, progress);
      for (const listener of [...(listeners.get(chapterId) ?? [])]) listener(progress);
    },
    listenerCount: (chapterId: string) => listeners.get(chapterId)?.size ?? 0,
  };
}

/** The saved ambience settings, as a port. `write` notifies subscribers, like the settings store. */
export function fakeAmbience(initial: AmbienceSettings = DEFAULT_AMBIENCE) {
  let current = initial;
  const listeners = new Set<(next: AmbienceSettings) => void>();
  const written: AmbienceSettings[] = [];
  const port: AmbiencePort = {
    read: () => current,
    write(next) {
      current = next;
      written.push(next);
      for (const listener of [...listeners]) listener(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    port,
    written,
    /** Changes the saved settings from outside the player, as the settings screen does. */
    saveFromSettings(next: AmbienceSettings) {
      port.write(next);
    },
    /** Changes the saved settings without telling subscribers, as a missed update would. */
    saveSilently(next: AmbienceSettings) {
      current = next;
    },
  };
}

export const DEFAULT_AMBIENCE: AmbienceSettings = { enabled: true, levelDb: -22, duckingDb: 7 };

/** A sample output that records what was asked to play. `finish` ends the playing sample. */
export function fakeSamples() {
  const requests: SampleRequest[] = [];
  let current: (() => void) | null = null;
  let stops = 0;
  const output: SampleOutput = {
    play(request, onEnd) {
      requests.push(request);
      current = onEnd;
    },
    stop() {
      stops += 1;
      current = null;
    },
    dispose() {
      current = null;
    },
  };
  return {
    output,
    requests,
    get stops() {
      return stops;
    },
    /** The playing sample reaches its end on its own. */
    finish() {
      const end = current;
      current = null;
      end?.();
    },
  };
}

/** No real timers: position saves in these tests flush on pause and on end. */
export const NO_TIMERS = {
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  setInterval: () => 0,
  clearInterval: () => undefined,
};

export interface SetupOptions {
  /** Virtual timers for the controller. By default they never fire, as before. */
  timers?: VirtualTimers;
}

export function setupController(
  chapters: ChapterForPlayback[],
  seeds: readonly SeededPosition[] = [],
  options: SetupOptions = {},
) {
  const fixture: Fixture = {
    chapters: new Map(chapters.map((c) => [c.chapter.id, c])),
    positions: seededPositions(seeds),
    saved: [],
    finished: [],
    rates: new Map(),
    rateWrites: [],
    bookmarks: [],
  };
  const engine: FakeAudioEngine = createFakeEngine();
  const pipe = fakePipeline();
  const ambience = fakeAmbience();
  const samples = fakeSamples();
  const controller: PlaybackController = createPlaybackController({
    data: createData(fixture),
    engine,
    pipeline: pipe.pipeline,
    ambience: ambience.port,
    samples: samples.output,
    defaultRate: () => 1,
    timers: options.timers ?? NO_TIMERS,
  });
  return { fixture, engine, controller, pipe, ambience, samples };
}

export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
