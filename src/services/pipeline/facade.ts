/*
 * The real PipelineFacade. It is the only surface the feature code uses. It reads and writes the
 * library through the repos and the LibraryFiles, runs chapters through the core queue, and keeps
 * each chapter's live progress in memory (progress.ts), seeded from the job rows when nothing runs.
 */
import type { Chapter, ChapterSource, Id, JobStatus, Stage, IdGenerator } from '@/core/domain';
import { decode, detectCharset } from '@/core/extract/charset';
import { loadPipeline } from '@/core/extract/load';
import type { PipelineEvent } from '@/core/pipeline/context';
import { estimateChapterCost } from '@/core/pipeline/estimate';
import type { CostStage } from '@/core/pipeline/estimate';
import type { Clock, Fetcher, PipelinePorts } from '@/core/pipeline/ports';
import { createPipelineQueue } from '@/core/pipeline/queue';
import type { PipelineQueue, QueueRunOptions, QueueSnapshot } from '@/core/pipeline/queue';
import { FETCH_LIMITS } from '@/core/pipeline/stages/web-extract';
import { estimateWordCount } from '@/core/text/word-count';
import { guessLanguage } from '@/core/translate/detect';
import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { settingsRepo } from '@/db/repos/settings-repo';
import { stageActivityRepo } from '@/db/repos/stage-activity-repo';
import { usageRepo } from '@/db/repos/usage-repo';
import type { Db } from '@/db/types';
import type {
  ChapterInput,
  ChapterProgress,
  CostEstimate,
  CostLine,
  PipelineFacade,
  SourcePreview,
} from '@/features/pipeline/facade';

import { activityOf } from './activity';
import { reduceEvent, emptyTracked, startRun, STAGE_ORDER, toChapterProgress } from './progress';
import { excerptOf, findNextChapterUrl, qualityOf } from './source-preview';

import type { LibraryFiles } from './library-files';
import type { TrackedChapter } from './progress';

export interface PipelineServiceDeps {
  readonly db: Db;
  readonly ports: PipelinePorts;
  readonly fetcher: Fetcher;
  readonly files: LibraryFiles;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** True while a foreground service keeps the runtime alive in the background. See the queue. */
  readonly keepsAliveInBackground?: () => boolean;
}

export interface PipelineService {
  readonly facade: PipelineFacade;
  readonly queue: PipelineQueue;
  /** Every runner event, in order, for the app's lifecycle (toasts, keep-awake). */
  subscribeEvents(listener: (event: PipelineEvent) => void): () => void;
}

const COST_STAGE_OF: Readonly<Record<CostStage, Stage>> = {
  cleanup: 'clean',
  analysis: 'analyze',
  translation: 'translate',
  narration: 'narrate',
};

/** File names come from the user's files, so only a safe subset of characters reaches the path. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/gu, '_').replace(/^\.+/u, '');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'document.pdf';
}

function defaultTitle(input: ChapterInput): string {
  switch (input.kind) {
    case 'url':
      return titleFromUrl(input.url);
    case 'pdf':
      return input.fileName.replace(/\.pdf$/iu, '');
    case 'text':
      return input.label;
  }
}

/** "https://example.com/the-night-harbour" becomes "The night harbour". */
export function titleFromUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const slug = pathname
      .split('/')
      .filter((part) => part.length > 0)
      .pop();
    if (!slug) return hostname.replace(/^www\./u, '');
    const words = decodeURIComponent(slug).replace(/[-_]+/gu, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return url;
  }
}

/** The stored source. A PDF points at the copy inside the library, not at the picked file. */
function sourceOf(input: ChapterInput, libraryPdfUri: string | undefined): ChapterSource {
  switch (input.kind) {
    case 'url':
      return { kind: 'url', url: input.url };
    case 'pdf':
      return { kind: 'pdf', fileUri: libraryPdfUri ?? input.fileUri, fileName: input.fileName };
    case 'text':
      return { kind: 'text', label: input.label };
  }
}

export function createPipelineService(deps: PipelineServiceDeps): PipelineService {
  const { db, ports, fetcher, files, clock, ids, keepsAliveInBackground } = deps;
  const tracked = new Map<string, TrackedChapter>();
  const progressListeners = new Map<string, Set<(progress: ChapterProgress) => void>>();
  const eventListeners = new Set<(event: PipelineEvent) => void>();
  const runsStarted = new Set<string>();

  const queue = createPipelineQueue(ports, {
    onEvent: (event) => handleEvent(event),
    keepsAliveInBackground,
  });

  function jobStatusOf(chapterId: Id, stage: Stage): JobStatus | null {
    return jobRepo.get(db, chapterId, stage)?.status ?? null;
  }

  function ledgerTotalOf(chapterId: Id): number {
    return usageRepo.totalCostForChapter(db, chapterId);
  }

  /** The state of a chapter that has no live run: what its row and its jobs say. */
  function seedFromDb(chapterId: Id): TrackedChapter {
    const chapter = chapterRepo.get(db, chapterId);
    if (!chapter) return emptyTracked('idle');
    const jobs = new Map(
      jobRepo.listForChapter(db, chapterId).map((job) => [job.stage, job] as const),
    );
    const stages = Object.fromEntries(
      STAGE_ORDER.map((stage) => {
        const job = jobs.get(stage);
        const status: JobStatus = !job || job.status === 'running' ? 'pending' : job.status;
        const progress = status === 'done' || status === 'skipped' ? 1 : (job?.progress ?? 0);
        return [stage, { status, progress, since: null, passages: null }];
      }),
    ) as TrackedChapter['stages'];
    const failed = STAGE_ORDER.map((stage) => jobs.get(stage)).find(
      (job) => job?.status === 'failed',
    );
    const ready = chapter.status === 'ready';
    const rows = audioSegmentRepo.listByChapter(db, chapterId);
    return {
      state: ready ? 'ready' : chapter.status === 'failed' ? 'failed' : 'idle',
      stages,
      playable: rows.length > 0,
      // The database does not store a segment's characters, so they are unknown until it is narrated again.
      segments: new Map(
        rows.map((row) => [row.idx, { durationMs: row.durationMs, chars: null }] as const),
      ),
      readySegments: rows.length,
      totalSegments: ready ? rows.length : null,
      spokenChars: null,
      secondsPerChar: null,
      timedSegments: 0,
      costBaseUsd: ledgerTotalOf(chapterId),
      runCostUsd: 0,
      error: failed?.error ?? null,
      reconnecting: false,
    };
  }

  function trackedOf(chapterId: Id): TrackedChapter {
    const existing = tracked.get(chapterId);
    if (existing) return existing;
    const seeded = seedFromDb(chapterId);
    tracked.set(chapterId, seeded);
    return seeded;
  }

  /** The state the UI shows: queued and running come from the queue, the rest from the tracker. */
  function stateOf(chapterId: Id): ChapterProgress['state'] {
    const current = trackedOf(chapterId);
    const snapshot = queue.snapshot();
    if (snapshot.running === chapterId) return 'running';
    if (snapshot.waiting.some((entry) => entry.chapterId === chapterId)) return 'waiting';
    if (snapshot.pending.includes(chapterId) && current.state !== 'failed') return 'queued';
    return current.state;
  }

  function snapshotOf(chapterId: Id): ChapterProgress {
    const retryAt =
      queue.snapshot().waiting.find((entry) => entry.chapterId === chapterId)?.retryAt ?? null;
    return toChapterProgress(chapterId, trackedOf(chapterId), stateOf(chapterId), retryAt);
  }

  function emit(chapterId: Id): void {
    const listeners = progressListeners.get(chapterId);
    if (!listeners || listeners.size === 0) return;
    const current = snapshotOf(chapterId);
    for (const listener of listeners) listener(current);
  }

  /** What Diagnostics keeps: when each stage last moved, and how often it stalled or went stale. */
  function recordActivity(event: PipelineEvent, at: number): void {
    const update = activityOf(event);
    if (update === null) return;
    const { chapterId, stage } = update;
    switch (update.kind) {
      case 'start':
        stageActivityRepo.startStage(db, chapterId, stage, at);
        return;
      case 'touch':
        stageActivityRepo.touch(db, chapterId, stage, at);
        return;
      case 'stall':
        stageActivityRepo.countStall(db, chapterId, stage, at);
        return;
      case 'staleAbort':
        stageActivityRepo.countStaleAbort(db, chapterId, stage, at);
        return;
    }
  }

  function handleEvent(event: PipelineEvent): void {
    const chapterId = event.chapterId;
    const current = trackedOf(chapterId);
    const at = clock.now();
    tracked.set(
      chapterId,
      reduceEvent(current, event, (stage) => jobStatusOf(chapterId, stage), at),
    );
    recordActivity(event, at);
    if (
      event.type === 'done' ||
      (event.type === 'stage' && ['failed', 'cancelled'].includes(event.status))
    ) {
      runsStarted.delete(chapterId);
    }
    emit(chapterId);
    for (const listener of eventListeners) listener(event);
  }

  /** Marks the chapter's run as started when the queue picks it, so its cost starts from the ledger. */
  function onQueueChange(snapshot: QueueSnapshot): void {
    const running = snapshot.running;
    if (running !== null && !runsStarted.has(running)) {
      runsStarted.add(running);
      tracked.set(running, startRun(trackedOf(running), ledgerTotalOf(running)));
    }
    for (const chapterId of progressListeners.keys()) emit(chapterId);
  }
  queue.subscribe(onQueueChange);

  function queueChapter(chapterId: Id, options: QueueRunOptions): void {
    if (queue.snapshot().running === chapterId) return;
    if (queue.snapshot().pending.includes(chapterId)) return;
    tracked.set(chapterId, { ...trackedOf(chapterId), state: 'queued', error: null });
    emit(chapterId);
    queue.enqueue(chapterId, options).catch(() => undefined);
  }

  const facade: PipelineFacade = {
    async previewUrl(url, signal) {
      const abort = signal ?? new AbortController().signal;
      const fetched = await fetcher.fetch(url, abort, FETCH_LIMITS);
      const charset = detectCharset(fetched.bytes, fetched.contentType ?? undefined);
      const html = decodeOrEmpty(fetched.bytes, charset);
      const { extractArticle } = await loadPipeline();
      const result = await extractArticle({
        bytes: fetched.bytes,
        contentType: fetched.contentType ?? undefined,
        url: fetched.finalUrl,
      });
      const best = result.best;
      const text = best?.text ?? '';
      const preview: SourcePreview = {
        title: best?.title ?? null,
        excerpt: excerptOf(text),
        wordCount: estimateWordCount(text),
        detectedLang: best?.lang ?? (text === '' ? null : guessLanguage(text)),
        quality: qualityOf(result.decision, text),
        nextChapterUrl: html === null ? null : await findNextChapterUrl(html, fetched.finalUrl),
      };
      return preview;
    },

    async estimate(input): Promise<CostEstimate> {
      const settings = settingsRepo.getSettings(db);
      const translates =
        input.targetLang !== null &&
        input.targetLang.toLowerCase() !== (input.sourceLang ?? 'en').toLowerCase();
      const estimate = await estimateChapterCost({
        size: { unit: 'chars', count: input.chars },
        sourceLang: input.sourceLang ?? 'en',
        targetLang: translates ? input.targetLang : null,
        models: {
          cleanup: settings.cleanupModel,
          analysis: settings.analysisModel,
          translation: settings.translationModel,
          narration: settings.narration.model,
        },
        catalog: ports.catalog,
      });
      const lines: CostLine[] = estimate.perStage
        .filter((line) => line.stage !== 'translation' || translates)
        .map((line) => ({
          stage: COST_STAGE_OF[line.stage],
          usd: line.usd,
          basis: line.basis,
        }));
      return {
        totalUsd: estimate.totalUsd,
        lowUsd: estimate.low,
        highUsd: estimate.high,
        lines,
      };
    },

    async createChapter({ seriesId, title, source }) {
      if (!seriesRepo.get(db, seriesId)) throw new Error(`Series ${seriesId} does not exist`);
      const chapterId = ids();
      let pdfUri: string | undefined;
      if (source.kind === 'pdf') {
        pdfUri = await files.importFile(
          source.fileUri,
          `sources/${chapterId}/${safeFileName(source.fileName)}`,
        );
      }
      if (source.kind === 'text') {
        await ports.chapters.saveSourceText(chapterId, source.text);
      }
      const siblings = chapterRepo.listBySeries(db, seriesId);
      const last = siblings[siblings.length - 1];
      const now = clock.now();
      const chapter: Chapter = {
        id: chapterId,
        seriesId,
        order: (last?.order ?? 0) + 1,
        title: title?.trim() || defaultTitle(source),
        source: sourceOf(source, pdfUri),
        sourceLang: null,
        status: 'draft',
        wordCount: null,
        durationMs: null,
        createdAt: now,
        updatedAt: now,
      };
      chapterRepo.insert(db, chapter);
      return chapterId;
    },

    enqueue(chapterId) {
      queueChapter(chapterId, {});
    },

    retryNow() {
      queue.retryNow();
    },

    cancel(chapterId) {
      const wasRunning = queue.snapshot().running === chapterId;
      queue.cancel(chapterId).catch(() => undefined);
      if (!wasRunning) {
        tracked.set(chapterId, { ...trackedOf(chapterId), state: 'cancelled' });
        emit(chapterId);
      }
    },

    retry(chapterId, from) {
      const stage = from === 'clean' ? 'extract' : from;
      queueChapter(chapterId, stage === undefined ? {} : { from: stage });
    },

    retryWithOcr(chapterId) {
      queueChapter(chapterId, { from: 'extract', pdfEngine: 'mistral-ocr' });
    },

    subscribe(chapterId, listener) {
      if (chapterRepo.get(db, chapterId) === null && !tracked.has(chapterId)) {
        listener(toChapterProgress(chapterId, emptyTracked('idle'), 'idle'));
        return () => undefined;
      }
      const listeners = progressListeners.get(chapterId) ?? new Set();
      listeners.add(listener);
      progressListeners.set(chapterId, listeners);
      listener(snapshotOf(chapterId));
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) progressListeners.delete(chapterId);
      };
    },
  };

  return {
    facade,
    queue,
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
  };
}

function decodeOrEmpty(bytes: Uint8Array, charset: string): string | null {
  try {
    return decode(bytes, charset);
  } catch {
    return null;
  }
}
