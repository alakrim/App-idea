/*
 * Fake PipelineFacade for tests and the dev gallery. It writes the same rows the real pipeline will
 * (chapters, jobs, sentences, translations), on a scripted, timer-driven schedule. Brief P2 replaces
 * it; until then the app runs on this file.
 */
import { createIdGenerator } from '@/core/domain';
import type { ChapterSource, Chapter, Job, JobStatus, PipelineError, Stage } from '@/core/domain';
import { buildChapterText } from '@/core/text/build';
import { estimateWordCount } from '@/core/text/word-count';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import type { Db } from '@/db/types';

import { FAKE_ARTICLE_TEXT, fakeTranslation } from './fake-content';

import type {
  ChapterInput,
  ChapterProgress,
  CostEstimate,
  CostLine,
  PipelineFacade,
  SourcePreview,
  StageProgress,
} from './facade';

export interface FakePipelineOptions {
  db: Db;
  /** Playback speed of the simulation. 1 is the demo pace; tests can pass a larger number. */
  speed?: number;
  /** Simulated network time for previewUrl. */
  previewMs?: number;
  now?: () => number;
  newId?: () => string;
}

type EstimateArgs = Parameters<PipelineFacade['estimate']>[0];

const STAGES: readonly Stage[] = ['extract', 'clean', 'segment', 'analyze', 'translate', 'narrate'];
/** Simulated duration of each stage at speed 1, in ms. */
const STAGE_MS: Readonly<Record<Stage, number>> = {
  extract: 900,
  clean: 1400,
  segment: 300,
  analyze: 1800,
  translate: 1600,
  narrate: 2600,
};
const TICK_MS = 120;
const NARRATION_SEGMENTS = 4;
/** Fake cost per stage, in USD. The total lands near the estimate for a typical chapter. */
const STAGE_COST_USD: Readonly<Record<Stage, number>> = {
  extract: 0,
  clean: 0.006,
  segment: 0,
  analyze: 0.011,
  translate: 0.009,
  narrate: 0.014,
};
const EXCERPT_CHARS = 400;
const FAKE_USD_PER_CHAR = 0.0000012;
const READING_WORDS_PER_MINUTE = 160;

interface StageSlot {
  status: JobStatus;
  progress: number;
}

interface Run {
  chapterId: string;
  seriesId: string;
  input: ChapterInput;
  ocr: boolean;
  state: ChapterProgress['state'];
  slots: Record<Stage, StageSlot>;
  active: Stage | null;
  error: PipelineError | null;
  timer: ReturnType<typeof setTimeout> | null;
  listeners: Set<(progress: ChapterProgress) => void>;
}

function emptySlots(): Record<Stage, StageSlot> {
  return Object.fromEntries(
    STAGES.map((stage) => [stage, { status: 'pending', progress: 0 }]),
  ) as Record<Stage, StageSlot>;
}

export function createFakePipeline(options: FakePipelineOptions): PipelineFacade {
  const { db } = options;
  const speed = options.speed ?? 1;
  const previewMs = options.previewMs ?? 900;
  const clock = options.now ?? Date.now;
  const newId = options.newId ?? createIdGenerator({ now: clock });
  const runs = new Map<string, Run>();

  function runFor(chapterId: string): Run {
    const existing = runs.get(chapterId);
    if (existing) return existing;
    const chapter = chapterRepo.get(db, chapterId);
    if (!chapter) throw new Error(`Chapter ${chapterId} does not exist`);
    const run = newRun(chapter, inputFromSource(chapter.source));
    runs.set(chapterId, run);
    return run;
  }

  function newRun(chapter: Chapter, input: ChapterInput): Run {
    return {
      chapterId: chapter.id,
      seriesId: chapter.seriesId,
      input,
      ocr: false,
      state: 'idle',
      slots: emptySlots(),
      active: null,
      error: null,
      timer: null,
      listeners: new Set(),
    };
  }

  function snapshot(run: Run): ChapterProgress {
    const stages: StageProgress[] = STAGES.map((stage) => ({
      stage,
      status: run.slots[stage].status,
      progress: run.slots[stage].progress,
    }));
    const narrate = run.slots.narrate;
    return {
      chapterId: run.chapterId,
      state: run.state,
      stages,
      overall: overallProgress(stages),
      readySegments:
        narrate.status === 'done'
          ? NARRATION_SEGMENTS
          : Math.floor(narrate.progress * NARRATION_SEGMENTS),
      totalSegments: run.state === 'idle' ? null : NARRATION_SEGMENTS,
      costUsdSoFar: STAGES.reduce(
        (sum, stage) => sum + (run.slots[stage].status === 'done' ? STAGE_COST_USD[stage] : 0),
        0,
      ),
      error: run.error,
    };
  }

  function emit(run: Run): void {
    const current = snapshot(run);
    for (const listener of run.listeners) listener(current);
  }

  function persistJob(run: Run, stage: Stage, patch: Partial<Job>): void {
    const existing = jobRepo.get(db, run.chapterId, stage);
    const base: Job = existing ?? {
      id: newId(),
      chapterId: run.chapterId,
      stage,
      status: 'pending',
      attempt: 0,
      inputHash: 'fake',
      model: null,
      promptVersion: null,
      progress: 0,
      error: null,
      costUsd: 0,
      startedAt: null,
      finishedAt: null,
    };
    jobRepo.upsert(db, { ...base, ...patch });
  }

  function setChapterStatus(run: Run, status: Chapter['status']): void {
    chapterRepo.setStatus(db, run.chapterId, status, clock());
  }

  function targetLangOf(run: Run): string | null {
    return seriesRepo.get(db, run.seriesId)?.targetLang ?? null;
  }

  function schedule(run: Run, ms: number): void {
    run.timer = setTimeout(() => tick(run), ms);
  }

  function clearTimer(run: Run): void {
    if (run.timer !== null) clearTimeout(run.timer);
    run.timer = null;
  }

  /** The next stage to run after `from`, skipping translation when no target language is set. */
  function nextStage(run: Run, from: Stage | null): Stage | null {
    const start = from === null ? 0 : STAGES.indexOf(from) + 1;
    for (const stage of STAGES.slice(start)) {
      const slot = run.slots[stage];
      if (slot.status === 'done' || slot.status === 'skipped') continue;
      if (stage === 'translate' && targetLangOf(run) === null) {
        slot.status = 'skipped';
        slot.progress = 1;
        continue;
      }
      return stage;
    }
    return null;
  }

  function failureFor(run: Run, stage: Stage): PipelineError | null {
    if (stage !== 'extract' || run.ocr) return null;
    const { input } = run;
    if (input.kind === 'pdf' && /scan/i.test(input.fileName)) {
      return {
        code: 'CONTENT_EMPTY',
        message: 'This PDF has no selectable text. It looks like a scan.',
        detail: 'scanned-pdf',
        retryable: false,
      };
    }
    if (input.kind === 'url' && input.url.includes('/fail')) {
      return {
        code: 'NETWORK',
        message: "We couldn't reach this page. Check your connection, then try again.",
        retryable: true,
      };
    }
    return null;
  }

  function sourceTextOf(run: Run): string {
    return run.input.kind === 'text' ? run.input.text : FAKE_ARTICLE_TEXT;
  }

  function failStage(run: Run, stage: Stage, error: PipelineError): void {
    run.slots[stage] = { status: 'failed', progress: 0 };
    run.state = 'failed';
    run.error = error;
    run.active = null;
    persistJob(run, stage, { status: 'failed', error, finishedAt: clock() });
    setChapterStatus(run, 'failed');
    emit(run);
  }

  function finishChapter(run: Run): void {
    run.state = 'ready';
    run.active = null;
    const words = estimateWordCount(sourceTextOf(run));
    chapterRepo.update(db, run.chapterId, {
      wordCount: words,
      durationMs: Math.round((words / READING_WORDS_PER_MINUTE) * 60_000),
      sourceLang: 'en',
    });
    setChapterStatus(run, 'ready');
    emit(run);
  }

  function completeStage(run: Run, stage: Stage): void {
    const slot = run.slots[stage];
    slot.status = 'done';
    slot.progress = 1;
    persistJob(run, stage, {
      status: 'done',
      progress: 1,
      costUsd: STAGE_COST_USD[stage],
      finishedAt: clock(),
    });
    if (stage === 'segment') writeText(run);
    if (stage === 'translate') writeTranslations(run);
  }

  function writeText(run: Run): void {
    const text = buildChapterText(sourceTextOf(run), 'en');
    textRepo.replaceChapterText(db, run.chapterId, {
      paragraphs: text.paragraphs.map((p) => ({
        idx: p.idx,
        sentenceStart: p.sentenceStart,
        sentenceEnd: p.sentenceEnd,
        kind: p.kind,
      })),
      sentences: text.sentences.map((s) => ({
        chapterId: run.chapterId,
        idx: s.idx,
        paragraphIdx: s.paragraphIdx,
        text: s.text,
        translated: null,
        charCount: s.charCount,
      })),
    });
  }

  function writeTranslations(run: Run): void {
    const target = targetLangOf(run);
    if (target === null) return;
    const text = buildChapterText(sourceTextOf(run), 'en');
    textRepo.setTranslations(
      db,
      run.chapterId,
      text.sentences.map((s) => ({ idx: s.idx, translated: fakeTranslation(s.text, target) })),
    );
  }

  /** One simulation step: a stage starts, advances, or finishes. Runs on a timer. */
  function tick(run: Run): void {
    run.timer = null;
    const stage = run.active;
    if (stage === null) return;
    const slot = run.slots[stage];

    if (slot.status === 'pending') {
      const failure = failureFor(run, stage);
      slot.status = 'running';
      persistJob(run, stage, {
        status: 'running',
        attempt: (jobRepo.get(db, run.chapterId, stage)?.attempt ?? 0) + 1,
        startedAt: clock(),
      });
      if (failure) {
        failStage(run, stage, failure);
        return;
      }
    }

    slot.progress = Math.min(1, slot.progress + (TICK_MS * speed) / STAGE_MS[stage]);
    if (slot.progress < 1) {
      emit(run);
      schedule(run, TICK_MS);
      return;
    }

    completeStage(run, stage);
    const next = nextStage(run, stage);
    if (next === null) {
      finishChapter(run);
      return;
    }
    run.active = next;
    emit(run);
    schedule(run, TICK_MS);
  }

  /** Starts (or resumes) processing from `from`. Earlier stages keep their finished state. */
  function start(run: Run, from: Stage): void {
    const fromIndex = STAGES.indexOf(from);
    for (const stage of STAGES.slice(fromIndex)) {
      run.slots[stage] = { status: 'pending', progress: 0 };
    }
    run.state = 'running';
    run.error = null;
    // Begin at `from`: every stage before it is either finished or skipped, so search from there.
    run.active = nextStage(run, fromIndex === 0 ? null : (STAGES[fromIndex - 1] ?? null));
    setChapterStatus(run, 'processing');
    emit(run);
    if (run.active !== null) {
      schedule(run, TICK_MS);
    } else {
      finishChapter(run);
    }
  }

  function firstFailedStage(run: Run): Stage {
    return STAGES.find((stage) => run.slots[stage].status === 'failed') ?? 'extract';
  }

  return {
    async previewUrl(url, signal) {
      await delay(previewMs, signal);
      return fakePreview(url);
    },

    async estimate(input) {
      return fakeEstimate(input);
    },

    async createChapter({ seriesId, title, source }) {
      const series = seriesRepo.get(db, seriesId);
      if (!series) throw new Error(`Series ${seriesId} does not exist`);
      const id = newId();
      const siblings = chapterRepo.listBySeries(db, seriesId);
      const last = siblings[siblings.length - 1];
      const now = clock();
      const chapter: Chapter = {
        id,
        seriesId,
        order: (last?.order ?? 0) + 1,
        title: title?.trim() || defaultTitle(source),
        source: sourceFor(source),
        sourceLang: null,
        status: 'draft',
        wordCount: null,
        durationMs: null,
        createdAt: now,
        updatedAt: now,
      };
      chapterRepo.insert(db, chapter);
      runs.set(id, newRun(chapter, source));
      return id;
    },

    enqueue(chapterId) {
      const run = runFor(chapterId);
      if (run.state === 'queued' || run.state === 'running') return;
      start(run, 'extract');
    },

    cancel(chapterId) {
      const run = runFor(chapterId);
      clearTimer(run);
      run.state = 'cancelled';
      run.active = null;
      jobRepo.cancelUnfinished(db, chapterId, clock());
      setChapterStatus(run, 'draft');
      emit(run);
    },

    retry(chapterId, from) {
      const run = runFor(chapterId);
      if (run.state === 'running' || run.state === 'queued') return;
      start(run, from ?? firstFailedStage(run));
    },

    retryWithOcr(chapterId) {
      const run = runFor(chapterId);
      if (run.state === 'running' || run.state === 'queued') return;
      run.ocr = true;
      start(run, 'extract');
    },

    subscribe(chapterId, listener) {
      const run = runFor(chapterId);
      run.listeners.add(listener);
      listener(snapshot(run));
      return () => {
        run.listeners.delete(listener);
      };
    },
  };
}

/** Preview of a URL without any delay or database. Path markers pick the extraction quality. */
export function fakePreview(url: string): SourcePreview {
  if (url.includes('/offline')) throw new TypeError('Network request failed');
  const quality = url.includes('/empty')
    ? 'empty'
    : url.includes('/render')
      ? 'needs_render'
      : url.includes('/needs-ai')
        ? 'needs_ai'
        : 'good';
  const body = quality === 'empty' ? '' : FAKE_ARTICLE_TEXT;
  return {
    title: titleFromUrl(url),
    excerpt: body.slice(0, EXCERPT_CHARS),
    wordCount: estimateWordCount(body),
    detectedLang: body === '' ? null : 'en',
    quality,
    nextChapterUrl: null,
  };
}

/** Cost of a chapter at a fixed per-character rate. The stage split mirrors the real estimate. */
export function fakeEstimate({ chars, sourceLang, targetLang }: EstimateArgs): CostEstimate {
  const translates = targetLang !== null && targetLang !== sourceLang;
  const total = chars * FAKE_USD_PER_CHAR * (translates ? 1.2 : 1);
  const lines: CostLine[] = [
    {
      stage: 'clean',
      usd: total * 0.14,
      basis: `About ${Math.round(chars / 4000)}k tokens of cleanup`,
    },
    { stage: 'analyze', usd: total * 0.3, basis: 'Ambience and memory, one pass' },
    ...(translates
      ? [{ stage: 'translate' as const, usd: total * 0.26, basis: `Into ${targetLang}` }]
      : []),
    { stage: 'narrate', usd: total * 0.3, basis: 'Narration of the full text' },
  ];
  return { totalUsd: total, lowUsd: total * 0.75, highUsd: total * 1.5, lines };
}

function inputFromSource(source: ChapterSource): ChapterInput {
  switch (source.kind) {
    case 'url':
      return { kind: 'url', url: source.url };
    case 'pdf':
      return { kind: 'pdf', fileUri: source.fileUri, fileName: source.fileName };
    case 'text':
      return { kind: 'text', text: '', label: source.label };
  }
}

function sourceFor(input: ChapterInput): ChapterSource {
  switch (input.kind) {
    case 'url':
      return { kind: 'url', url: input.url };
    case 'pdf':
      return { kind: 'pdf', fileUri: input.fileUri, fileName: input.fileName };
    case 'text':
      return { kind: 'text', label: input.label };
  }
}

function defaultTitle(input: ChapterInput): string {
  switch (input.kind) {
    case 'url':
      return titleFromUrl(input.url);
    case 'pdf':
      return input.fileName.replace(/\.pdf$/i, '');
    case 'text':
      return input.label;
  }
}

/** "https://example.com/the-night-harbour" becomes "The night harbour". */
function titleFromUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const slug = pathname
      .split('/')
      .filter((part) => part.length > 0)
      .pop();
    if (!slug) return hostname.replace(/^www\./, '');
    const words = decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return url;
  }
}

function overallProgress(stages: readonly StageProgress[]): number {
  let done = 0;
  let total = 0;
  for (const entry of stages) {
    if (entry.status === 'skipped') continue;
    const weight = STAGE_MS[entry.stage];
    done += weight * entry.progress;
    total += weight;
  }
  return total === 0 ? 0 : done / total;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}
