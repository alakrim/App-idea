import { createFakeEngine, type FakeAudioEngine } from '@/audio/fake-engine';
import type { AmbienceCue, Chapter, ChapterStatus, PlaybackPoint, Sentence, Series } from '@/core/domain';
import type { ChapterForPlayback } from '@/db/repos/playback-repo';
import type { ChapterProgress, PipelineFacade } from '@/features/pipeline/facade';

import { createPlaybackController, type PlaybackController } from '../playback-controller';

import type { PlaybackData } from '../playback-data';

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

export interface Fixture {
  chapters: Map<string, ChapterForPlayback>;
  saved: PlaybackPoint[];
  current: PlaybackPoint | null;
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
    currentPoint: () => fixture.current,
    nextReadyChapterId(_seriesId, afterOrder) {
      const next = [...fixture.chapters.values()]
        .filter((c) => c.chapter.order > afterOrder && c.chapter.status === 'ready')
        .sort((a, b) => a.chapter.order - b.chapter.order)[0];
      return next ? next.chapter.id : null;
    },
    savePosition: (_seriesId, chapterId, sentenceIdx) => {
      fixture.saved.push({ chapterId, chapterOrder: 0, sentenceIdx });
    },
    segmentsFrom: (chapterId, fromIdx) =>
      (fixture.chapters.get(chapterId)?.segments ?? []).filter((s) => s.idx >= fromIdx),
  };
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
    emit(chapterId: string, state: ChapterProgress['state'], readySegments: number) {
      const progress: ChapterProgress = {
        chapterId,
        state,
        stages: [],
        overall: 0,
        readySegments,
        totalSegments: null,
        costUsdSoFar: 0,
        error: null,
      };
      latest.set(chapterId, progress);
      for (const listener of [...(listeners.get(chapterId) ?? [])]) listener(progress);
    },
    listenerCount: (chapterId: string) => listeners.get(chapterId)?.size ?? 0,
  };
}

/** No real timers: position saves in these tests flush on pause and on end. */
export const NO_TIMERS = {
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  setInterval: () => 0,
  clearInterval: () => undefined,
};

export function setupController(chapters: ChapterForPlayback[], current: PlaybackPoint | null = null) {
  const fixture: Fixture = {
    chapters: new Map(chapters.map((c) => [c.chapter.id, c])),
    saved: [],
    current,
  };
  const engine: FakeAudioEngine = createFakeEngine();
  const pipe = fakePipeline();
  const controller: PlaybackController = createPlaybackController({
    data: createData(fixture),
    engine,
    pipeline: pipe.pipeline,
    timers: NO_TIMERS,
  });
  return { fixture, engine, controller, pipe };
}

export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

