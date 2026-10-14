/*
 * End to end: a URL goes in, a chapter comes out ready to play. The real composition runs (the
 * repos on an in-memory SQLite with the shipped migrations, the core queue and runner, the adapters,
 * the OpenRouter client), over a fake network that serves the article, the catalog, canned structured
 * replies, tiny valid mp3 frames and PCM for Gemini TTS. Nothing reaches a real service.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { createIdGenerator } from '@/core/domain';
import type { PipelineEvent } from '@/core/pipeline/context';
import type { WebViewExtractor } from '@/core/pipeline/ports';
import type { Settings } from '@/core/settings';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { cueRepo } from '@/db/repos/cue-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { memoryRepo } from '@/db/repos/memory-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { settingsRepo } from '@/db/repos/settings-repo';
import { textRepo } from '@/db/repos/text-repo';
import { usageLedger } from '@/db/schema';
import type { ChapterProgress } from '@/features/pipeline/facade';
import { createOpenRouterClient } from '@/services/openrouter';

import { NARRATION_MODEL, PAGE_URL, createNetwork } from './__fixtures__/e2e-network';
import { createMemoryLibraryFiles } from './__fixtures__/memory-library-files';
import { createPipelineRuntime } from './runtime';
import { WebViewRenderQueue } from './webview-queue';

import type { Network } from './__fixtures__/e2e-network';
import type { PipelineRuntime } from './runtime';

const ARTICLE_HTML = readFileSync(
  path.join(__dirname, '..', '..', 'core', 'extract', '__fixtures__', 'news-article.html'),
  'utf8',
);
const SERIES_ID = '01J00000000000000000000SRS';
const T0 = 1_700_000_000_000;
const TRACE = process.env.LECTIO_E2E_TRACE === '1';
const HARBOUR_TEXT = [
  'The storm came in from the west before the lamps were lit.',
  'Mara Quill climbed the tower with a box of matches and a ledger.',
  'Below her the boats strained against their ropes at the quay.',
  'Nobody in the town slept that night, and the rain never stopped.',
  'By dawn the breakwater had held, but the lower street was gone.',
].join(' ');

interface World {
  readonly db: ReturnType<typeof createTestDb>['db'];
  readonly network: Network;
  readonly files: ReturnType<typeof createMemoryLibraryFiles>;
  readonly runtime: PipelineRuntime;
  readonly apiKey: { value: string | null };
  readonly trace: string[];
  readonly events: PipelineEvent[];
  readonly startedAt: number;
}

const noWebView: WebViewExtractor = {
  render: () => Promise.reject(new Error('The WebView is not expected in this test.')),
};

function buildWorld(webview: WebViewExtractor = noWebView): World {
  const { db } = createTestDb();
  seriesRepo.insert(db, {
    id: SERIES_ID,
    title: 'The Harbour Quarter',
    coverUri: null,
    coverTint: null,
    sourceLang: 'en',
    targetLang: 'it',
    narrationProfileId: null,
    createdAt: T0,
    updatedAt: T0,
  });
  const network = createNetwork(ARTICLE_HTML);
  const apiKey: { value: string | null } = { value: 'sk-or-v1-TESTKEY-0000000000' };
  const openrouter = createOpenRouterClient({
    getApiKey: async () => apiKey.value,
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: network.fetchImpl,
    maxRetries: 0,
    sleep: async () => undefined,
    random: () => 0.5,
    now: () => T0,
  });
  let tick = T0;
  const clock = { now: () => (tick += 1) };
  const files = createMemoryLibraryFiles();
  const runtime = createPipelineRuntime({
    db,
    openrouter,
    files,
    webview,
    storage: { freeBytes: async () => 10 * 1024 * 1024 * 1024 },
    fetchImpl: network.fetchImpl,
    clock,
    ids: createIdGenerator({ now: clock.now }),
  });
  const world: World = {
    db,
    network,
    files,
    runtime,
    apiKey,
    trace: [],
    events: [],
    startedAt: Date.now(),
  };
  runtime.subscribeEvents((event) => {
    world.events.push(event);
    const line = describeEvent(event);
    if (line) world.trace.push(line);
  });
  return world;
}

function describeEvent(event: PipelineEvent): string | null {
  switch (event.type) {
    case 'stage':
      return `stage ${event.stage} -> ${event.status}`;
    case 'cost':
      return `cost ${event.stage} +$${event.usd.toFixed(6)} (run total $${event.totalUsd.toFixed(6)})`;
    case 'segmentReady':
      return `segmentReady #${event.segment.idx} sentences ${event.segment.sentenceStart}-${event.segment.sentenceEnd} ${event.segment.durationMs}ms`;
    case 'error':
      return `error ${event.stage}: ${event.error.code} ${event.error.message}`;
    case 'done':
      return 'done';
    case 'progress':
      return null;
    case 'stall':
      return `stall ${event.stage} #${event.count}`;
    case 'staleAbort':
      return `staleAbort ${event.stage}`;
    case 'reconnecting':
      return 'reconnecting';
  }
}

function dumpTrace(label: string, lines: readonly string[]): void {
  if (!TRACE) return;
  process.stdout.write(`\n=== e2e trace: ${label} ===\n${lines.join('\n')}\n`);
}

/** Records every progress snapshot a chapter emits, in order. */
function watch(
  world: World,
  chapterId: string,
): { snapshots: ChapterProgress[]; stop: () => void } {
  const snapshots: ChapterProgress[] = [];
  const stop = world.runtime.facade.subscribe(chapterId, (p) => snapshots.push(p));
  return { snapshots, stop };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition never held');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

/** Chat calls of one structured-output schema, so LLM stages can be counted separately. */
function callsNamed(network: Network, schema: string): number {
  return network.calls.filter(
    (call) =>
      (call.body?.response_format as { json_schema?: { name?: string } } | undefined)?.json_schema
        ?.name === schema,
  ).length;
}

function makeChapter(world: World, url = PAGE_URL): Promise<string> {
  return world.runtime.facade.createChapter({
    seriesId: SERIES_ID,
    title: null,
    source: { kind: 'url', url },
  });
}

describe('pipeline end to end (URL to playable chapter)', () => {
  it('runs every stage, persists the results, and reports monotonic progress', async () => {
    const world = buildWorld();
    const { db, network, files, runtime } = world;

    const preview = await runtime.facade.previewUrl(PAGE_URL);
    expect(preview.quality).toBe('good');
    expect(preview.excerpt.length).toBeGreaterThan(0);

    const estimate = await runtime.facade.estimate({
      chars: 3000,
      sourceLang: 'en',
      targetLang: 'it',
    });
    expect(estimate.totalUsd).toBeGreaterThan(0);
    expect(estimate.lines.map((line) => line.stage)).toEqual([
      'clean',
      'analyze',
      'translate',
      'narrate',
    ]);

    const chapterId = await makeChapter(world);
    const watched = watch(world, chapterId);
    runtime.facade.enqueue(chapterId);
    await runtime.idle();
    watched.stop();

    // Chapter row, status and metadata.
    const chapter = chapterRepo.get(db, chapterId);
    expect(chapter?.status).toBe('ready');
    expect(chapter?.title).toMatch(/^Harbour storm/u);
    expect(chapter?.sourceLang).toBe('en');
    expect(chapter?.wordCount).toBeGreaterThan(50);

    // Sentences, every one translated.
    const sentences = textRepo.getRange(db, chapterId, 0, 10_000);
    expect(sentences.length).toBeGreaterThan(5);
    expect(sentences.every((s) => s.translated?.startsWith('IT: '))).toBe(true);

    // Cues and memory.
    const cues = cueRepo.listForChapter(db, chapterId);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ category: 'light_rain', enabled: true });
    const memory = memoryRepo.getMemoryRecord(db, chapterId);
    expect(memory?.memory.summary).toMatch(/storm reaches the harbour/);

    // Entities and facts for the series.
    const entities = memoryRepo.listEntities(db, SERIES_ID);
    expect(entities.map((e) => e.canonicalName)).toContain('Mara Quill');
    expect(memoryRepo.listFacts(db, SERIES_ID).length).toBeGreaterThan(0);

    // Audio segments: contiguous, with durations and per-sentence offsets.
    const segments = audioSegmentRepo.listByChapter(db, chapterId);
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments.map((s) => s.idx)).toEqual(segments.map((_, i) => i));
    for (const segment of segments) {
      expect(segment.durationMs).toBeGreaterThan(0);
      expect(segment.sentenceOffsetsMs).toHaveLength(
        segment.sentenceEnd - segment.sentenceStart + 1,
      );
    }
    // The chapter's length is the sum of its segments, written by the narrate stage.
    const spokenMs = segments.reduce((sum, s) => sum + s.durationMs, 0);
    expect(chapterRepo.get(db, chapterId)?.durationMs).toBe(spokenMs);

    // Files written: the extracted text and one file per segment. The narration model is Gemini
    // TTS, which returns PCM, so the segments are stored as WAV.
    const written = [...files.entries.keys()];
    expect(written).toContain(`sources/${chapterId}/text.txt`);
    for (const segment of segments) {
      expect(written).toContain(`audio/${chapterId}/${segment.idx}.wav`);
    }

    // Usage rows: one per model call, with the real cost OpenRouter reported.
    const usage = db.select().from(usageLedger).where(eq(usageLedger.chapterId, chapterId)).all();
    expect(usage.filter((u) => u.stage === 'analyze')).toHaveLength(1);
    expect(usage.filter((u) => u.stage === 'translate').length).toBeGreaterThanOrEqual(1);
    expect(usage.filter((u) => u.stage === 'narrate')).toHaveLength(segments.length);
    const analyzeCost = usage.find((u) => u.stage === 'analyze')?.costUsd ?? 0;
    expect(analyzeCost).toBeCloseTo(0.0021, 10);

    // Job rows: every stage settled, with the run's cost on the stages that spent money.
    const jobs = Object.fromEntries(jobRepo.listForChapter(db, chapterId).map((j) => [j.stage, j]));
    expect(Object.keys(jobs).sort()).toEqual(
      ['analyze', 'clean', 'extract', 'narrate', 'segment', 'translate'].sort(),
    );
    expect(jobs.extract?.status).toBe('done');
    expect(jobs.clean?.status).toBe('skipped');
    expect(jobs.analyze?.status).toBe('done');
    expect(jobs.narrate?.status).toBe('done');
    expect(jobs.narrate?.model).toBe(NARRATION_MODEL);
    expect(jobs.narrate?.costUsd).toBeGreaterThan(0);

    // Progress: monotonic, and it ends at 1 with the chapter ready.
    const overall = watched.snapshots.map((p) => p.overall);
    for (let i = 1; i < overall.length; i += 1) {
      expect(overall[i]).toBeGreaterThanOrEqual((overall[i - 1] ?? 0) - 1e-12);
    }
    const last = watched.snapshots[watched.snapshots.length - 1];
    expect(last?.state).toBe('ready');
    expect(last?.overall).toBe(1);
    expect(last?.readySegments).toBe(segments.length);
    expect(last?.costUsdSoFar).toBeGreaterThan(0);

    // Network: one analysis call, the translation in batches, and one speech call per segment.
    expect(callsNamed(network, 'chapter_analysis')).toBe(1);
    expect(callsNamed(network, 'chapter_translation')).toBeGreaterThanOrEqual(1);
    expect(network.speechCount()).toBe(segments.length);

    const totalUsd = usage.reduce((sum, u) => sum + (u.costUsd ?? 0), 0);
    const elapsedMs = Date.now() - world.startedAt;
    dumpTrace('URL chapter, Italian', world.trace);
    if (TRACE) {
      process.stdout.write(
        `measured: ${segments.length} segments, ${sentences.length} sentences, ` +
          `${usage.length} ledger rows, total $${totalUsd.toFixed(6)}, ${elapsedMs} ms wall clock\n`,
      );
    }
  });

  it('cancels mid-narration, keeps the finished segments, and resumes only the rest', async () => {
    const world = buildWorld();
    const { db, network, runtime } = world;
    const chapterId = await makeChapter(world);
    network.holdSpeech = { afterCalls: 2 };

    runtime.facade.enqueue(chapterId);
    await waitUntil(() => network.speechCount() >= 4);
    runtime.facade.cancel(chapterId);
    await runtime.idle();

    expect(jobRepo.get(db, chapterId, 'narrate')?.status).toBe('cancelled');
    expect(chapterRepo.get(db, chapterId)?.status).toBe('draft');
    const finished = audioSegmentRepo.listByChapter(db, chapterId);
    expect(finished.map((s) => s.idx)).toEqual([0, 1]);
    const before = {
      speech: network.speechCount(),
      analysis: callsNamed(network, 'chapter_analysis'),
      translation: callsNamed(network, 'chapter_translation'),
    };

    network.holdSpeech = null;
    const watched = watch(world, chapterId);
    runtime.facade.enqueue(chapterId);
    await runtime.idle();
    watched.stop();

    const segments = audioSegmentRepo.listByChapter(db, chapterId);
    expect(chapterRepo.get(db, chapterId)?.status).toBe('ready');
    // Only the segments that were not saved are synthesized again.
    expect(network.speechCount() - before.speech).toBe(segments.length - finished.length);
    // Analysis and translation are not repeated: their jobs are still done with the same input.
    expect(callsNamed(network, 'chapter_analysis')).toBe(before.analysis);
    expect(callsNamed(network, 'chapter_translation')).toBe(before.translation);
    expect(segments.slice(0, 2).map((s) => s.fileUri)).toEqual(finished.map((s) => s.fileUri));
    // The resumed run ends ready, with the segments made before the cancel counted in.
    expect(watched.snapshots[watched.snapshots.length - 1]?.state).toBe('ready');
    expect(watched.snapshots[watched.snapshots.length - 1]?.readySegments).toBe(segments.length);
    dumpTrace('cancel and resume mid-narration', world.trace);
  });

  it('regenerates only the narration when the voice changes', async () => {
    const world = buildWorld();
    const { db, network, runtime } = world;
    const chapterId = await makeChapter(world);
    runtime.facade.enqueue(chapterId);
    await runtime.idle();
    const segmentsBefore = audioSegmentRepo.listByChapter(db, chapterId);
    const callsBefore = {
      analysis: callsNamed(network, 'chapter_analysis'),
      translation: callsNamed(network, 'chapter_translation'),
      speech: network.speechCount(),
    };
    world.trace.length = 0;

    const current = settingsRepo.getSettings(db);
    const next: Settings['narration'] = { ...current.narration, voice: 'Puck' };
    settingsRepo.patchSettings(db, { narration: next }, T0 + 10);
    runtime.facade.enqueue(chapterId);
    await runtime.idle();

    const segmentsAfter = audioSegmentRepo.listByChapter(db, chapterId);
    expect(segmentsAfter).toHaveLength(segmentsBefore.length);
    expect(segmentsAfter[0]?.profileId).not.toBe(segmentsBefore[0]?.profileId);
    // Every segment is made again with the new voice; the LLM stages do not run again.
    expect(network.speechCount() - callsBefore.speech).toBe(segmentsBefore.length);
    expect(callsNamed(network, 'chapter_analysis')).toBe(callsBefore.analysis);
    expect(callsNamed(network, 'chapter_translation')).toBe(callsBefore.translation);
    const voices = network.calls
      .filter((c) => c.path === '/audio/speech')
      .slice(callsBefore.speech)
      .map((c) => c.body?.voice);
    expect(new Set(voices)).toEqual(new Set(['Puck']));
    expect(chapterRepo.get(db, chapterId)?.status).toBe('ready');
    expect(world.trace).toEqual(
      expect.arrayContaining([
        'stage extract -> skipped',
        'stage analyze -> skipped',
        'stage translate -> skipped',
        'stage narrate -> running',
        'stage narrate -> done',
      ]),
    );
    dumpTrace('voice change', world.trace);
  });

  it('narrates pasted text without fetching anything', async () => {
    const world = buildWorld();
    const { db, network, runtime } = world;
    const id = await runtime.facade.createChapter({
      seriesId: SERIES_ID,
      title: null,
      source: { kind: 'text', label: 'Pasted story', text: HARBOUR_TEXT },
    });
    runtime.facade.enqueue(id);
    await runtime.idle();

    expect(chapterRepo.get(db, id)).toMatchObject({ status: 'ready', title: 'Pasted story' });
    expect(network.pageRequests).toEqual([]);
    expect(textRepo.getRange(db, id, 0, 100).every((s) => s.translated !== null)).toBe(true);
    expect(audioSegmentRepo.listByChapter(db, id).length).toBeGreaterThan(0);
  });

  it('reads a text PDF with the free engine, from its copy in the library', async () => {
    const world = buildWorld();
    const { db, network, runtime, files } = world;
    files.entries.set('inbox/harbour.pdf', new Uint8Array([37, 80, 68, 70]));
    network.pdfTextByEngine = { 'cloudflare-ai': HARBOUR_TEXT };
    const id = await runtime.facade.createChapter({
      seriesId: SERIES_ID,
      title: null,
      source: { kind: 'pdf', fileUri: 'mem://inbox/harbour.pdf', fileName: 'harbour.pdf' },
    });
    runtime.facade.enqueue(id);
    await runtime.idle();

    expect(chapterRepo.get(db, id)?.status).toBe('ready');
    expect(network.pdfEngines).toEqual(['cloudflare-ai']);
    expect(files.entries.has(`sources/${id}/harbour.pdf`)).toBe(true);
    expect(chapterRepo.get(db, id)?.title).toBe('harbour');
  });

  it('stops at a scanned PDF, and reads it only after the OCR retry the user confirms', async () => {
    const world = buildWorld();
    const { db, network, runtime, files } = world;
    files.entries.set('inbox/scan.pdf', new Uint8Array([37, 80, 68, 70]));
    network.pdfTextByEngine = { 'cloudflare-ai': '', 'mistral-ocr': HARBOUR_TEXT };
    const id = await runtime.facade.createChapter({
      seriesId: SERIES_ID,
      title: null,
      source: { kind: 'pdf', fileUri: 'mem://inbox/scan.pdf', fileName: 'scan.pdf' },
    });
    runtime.facade.enqueue(id);
    await runtime.idle();

    expect(chapterRepo.get(db, id)?.status).toBe('failed');
    expect(jobRepo.get(db, id, 'extract')?.error).toMatchObject({
      code: 'CONTENT_EMPTY',
      detail: 'scanned_pdf',
      retryable: false,
    });
    expect(network.pdfEngines).toEqual(['cloudflare-ai']);

    runtime.facade.retryWithOcr(id);
    await runtime.idle();

    expect(network.pdfEngines).toEqual(['cloudflare-ai', 'mistral-ocr']);
    expect(chapterRepo.get(db, id)?.status).toBe('ready');
  });

  it('renders a page the fetch cannot read in the hidden WebView, through the render queue', async () => {
    // A bare app shell, as a JavaScript-rendered page returns before its scripts run.
    const renders = new WebViewRenderQueue(5_000);
    // The host renders each request and reports its HTML, as the mounted WebView does.
    const host = renders.subscribe(() => {
      const active = renders.current();
      if (active) renders.complete(active.id, ARTICLE_HTML);
    });
    const world = buildWorld({ render: (url, signal) => renders.render(url, signal) });
    world.network.pageHtml =
      '<html><body><div id="root"></div><script src="app.js"></script></body></html>';
    const { db, runtime, network } = world;

    const preview = await runtime.facade.previewUrl(PAGE_URL);
    expect(preview.quality).toBe('needs_render');

    const id = await makeChapter(world);
    runtime.facade.enqueue(id);
    await runtime.idle();
    host();

    expect(chapterRepo.get(db, id)?.status).toBe('ready');
    expect(network.pageRequests).toEqual([PAGE_URL, PAGE_URL]);
    expect(textRepo.getRange(db, id, 0, 100).some((s) => s.text.includes('storm'))).toBe(true);
  });

  it('pauses the queue when the key is missing, and resumes from the failed stage once it is saved', async () => {
    const world = buildWorld();
    const { runtime, apiKey, db } = world;
    world.apiKey.value = null;
    const first = await makeChapter(world);
    const second = await makeChapter(world, `${PAGE_URL}-two`);
    runtime.facade.enqueue(first);
    runtime.facade.enqueue(second);
    await runtime.idle();

    expect(runtime.isPaused()).toBe(true);
    const failed = watch(world, first);
    expect(failed.snapshots[failed.snapshots.length - 1]?.state).toBe('failed');
    expect(failed.snapshots[failed.snapshots.length - 1]?.error?.code).toBe('AUTH');
    failed.stop();
    expect(runtime.facade.subscribe(second, () => undefined)).toEqual(expect.any(Function));
    expect(chapterRepo.get(db, second)?.status).toBe('draft');

    apiKey.value = 'sk-or-v1-TESTKEY-0000000000';
    runtime.resume();
    await runtime.idle();

    expect(runtime.isPaused()).toBe(false);
    expect(chapterRepo.get(db, first)?.status).toBe('ready');
    expect(chapterRepo.get(db, second)?.status).toBe('ready');
    expect(world.events.some((e) => e.type === 'error' && e.error.code === 'AUTH')).toBe(true);
  });
});
