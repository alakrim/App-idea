import type { Stage } from '@/core/domain';
import type { LlmRequest } from '@/core/llm/transport';

import { CHAPTER_ID, createFakePorts, MODELS, mp3Bytes } from './__fixtures__/fake-ports';
import { articleHtml, extractFixture, longText } from './__fixtures__/pages';
import { StageFailure } from './errors';
import { runChapter } from './runner';
import { STALL_AFTER_MS, STALLED_ERROR } from './stall-watchdog';

import type { PipelineEvent } from './context';

const URL_SOURCE = {
  kind: 'url',
  url: 'https://coastalcourier.example/weather/harbour-storm',
} as const;
const PASTED = 'The sea was calm. The boats came in at dusk. Ada waited on the quay for the post.';

/** Collects events in order, for assertions on the sequence of stages. */
function recorder(): { events: PipelineEvent[]; onEvent: (e: PipelineEvent) => void } {
  const events: PipelineEvent[] = [];
  return { events, onEvent: (event) => events.push(event) };
}

/**
 * The settled status of each stage of the run. Analyze, translate and narrate run at once, so the
 * order of their events is not part of the contract, only the status each one ends with.
 */
function stageStatuses(events: PipelineEvent[]): Record<string, string> {
  const statuses: Record<string, string> = {};
  for (const e of events) {
    if (e.type === 'stage' && e.status !== 'running') statuses[e.stage] = e.status;
  }
  return statuses;
}

function callsNamed(state: { llmCalls: { request: LlmRequest }[] }, name: string): number {
  return state.llmCalls.filter((c) => c.request.jsonSchema?.name === name).length;
}

/** A transport failure as the OpenRouter client reports it: a PipelineError on `error`. */
function networkFailure(): Error {
  return Object.assign(new Error('No connection'), {
    error: { code: 'NETWORK', message: 'No connection to OpenRouter.', retryable: false },
  });
}

describe('runChapter: the happy path', () => {
  it('runs a URL chapter end to end, accepting the page without model cleanup', async () => {
    const fake = createFakePorts({ source: URL_SOURCE, html: extractFixture('news-article.html') });
    const { events, onEvent } = recorder();

    const outcome = await runChapter(CHAPTER_ID, fake.ports, { onEvent });

    expect(outcome).toEqual({ status: 'ready' });
    expect(stageStatuses(events)).toEqual({
      extract: 'done',
      segment: 'done',
      analyze: 'done',
      translate: 'skipped',
      narrate: 'done',
    });
    expect(events.at(-1)).toEqual({ type: 'done', chapterId: CHAPTER_ID });

    const chapter = fake.chapter();
    expect(chapter.status).toBe('ready');
    expect(chapter.title).toContain('Harbour storm');
    expect(chapter.sourceLang).toBe('en');
    expect(chapter.wordCount).toBeGreaterThan(0);
    expect(chapter.durationMs).toBeGreaterThan(0);
    expect(fake.state.fetched).toEqual([URL_SOURCE.url]);
    expect(fake.state.sentences.get(CHAPTER_ID)?.length).toBeGreaterThan(0);
    expect(fake.state.memories.has(CHAPTER_ID)).toBe(true);
    expect(fake.state.segments.get(CHAPTER_ID)?.length).toBeGreaterThan(0);
    expect(fake.job('clean')?.status).toBe('skipped');
    expect(fake.job('narrate')?.status).toBe('done');
  });

  it('runs a PDF chapter, strips running headers and records the parser usage', async () => {
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    const page = (n: number) =>
      [
        'Harbour Notes 2026',
        `The council met on ${DAYS[n - 1]} and the quay was cleared before the storm.`,
        `Residents on ${DAYS[n - 1]} were asked to keep the lanes free for the lifeboat crew.`,
        `Boats were moved inland early on ${DAYS[n - 1]}, and the harbour master signed the order.`,
        `${n + 1}`,
      ].join('\n');
    const pages = [page(1), page(2), page(3), page(4)];
    const fake = createFakePorts({
      source: { kind: 'pdf', fileUri: 'file:///notes.pdf', fileName: 'Harbour Notes.pdf' },
      pdf: {
        text: pages.join('\n'),
        pages,
        model: 'pdf/parser',
        usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.002 },
      },
    });

    const outcome = await runChapter(CHAPTER_ID, fake.ports);

    expect(outcome.status).toBe('ready');
    expect(fake.chapter().title).toBe('Harbour Notes');
    const text = fake.state.sourceText.get(CHAPTER_ID) ?? '';
    expect(text).not.toContain('Harbour Notes 2026');
    expect(text).toContain('The council met on Tuesday');
    expect(fake.state.pdfCalls).toEqual([{ engine: 'cloudflare-ai' }]);
    expect(fake.state.ledger.find((e) => e.stage === 'extract')).toMatchObject({
      model: 'pdf/parser',
      costUsd: 0.002,
    });
  });

  it('runs a pasted-text chapter, using the label as the title when none was typed', async () => {
    const fake = createFakePorts({ sourceText: PASTED });
    const outcome = await runChapter(CHAPTER_ID, fake.ports);
    expect(outcome.status).toBe('ready');
    expect(fake.chapter().title).toBe('Pasted');
    expect(fake.state.fetched).toEqual([]);
    expect(fake.state.llmCalls.map((c) => c.request.jsonSchema?.name)).toEqual([
      'chapter_analysis',
    ]);
  });

  it('keeps a title the user typed', async () => {
    const fake = createFakePorts({ sourceText: PASTED, title: 'My own title' });
    await runChapter(CHAPTER_ID, fake.ports);
    expect(fake.chapter().title).toBe('My own title');
  });

  it('reports a missing chapter as a failure without touching any job', async () => {
    const fake = createFakePorts();
    const outcome = await runChapter('0'.repeat(26), fake.ports);
    expect(outcome).toMatchObject({
      status: 'failed',
      error: { code: 'UNKNOWN', retryable: false },
    });
    expect(fake.state.jobs.size).toBe(0);
  });
});

describe('runChapter: extraction routes', () => {
  it('re-renders a JavaScript shell in the WebView, then re-gates the rendered page', async () => {
    const fake = createFakePorts({
      source: URL_SOURCE,
      html: extractFixture('spa-shell.html'),
      rendered: extractFixture('news-article.html'),
    });
    const outcome = await runChapter(CHAPTER_ID, fake.ports);
    expect(outcome.status).toBe('ready');
    expect(fake.state.rendered).toEqual([URL_SOURCE.url]);
    expect(fake.chapter().title).toContain('Harbour storm');
    expect(fake.job('clean')?.status).toBe('skipped');
  });

  it('fails with CONTENT_EMPTY when the rendered page is still unreadable', async () => {
    const fake = createFakePorts({
      source: URL_SOURCE,
      html: extractFixture('spa-shell.html'),
      rendered: extractFixture('spa-shell.html'),
    });
    const outcome = await runChapter(CHAPTER_ID, fake.ports);
    expect(outcome).toMatchObject({
      status: 'failed',
      stage: 'extract',
      error: { code: 'CONTENT_EMPTY', retryable: false, detail: 'webview_low_quality' },
    });
    expect(fake.chapter().status).toBe('failed');
    expect(fake.job('extract')?.status).toBe('failed');
  });

  it('uses the cleanup model to choose blocks, and keeps only the chosen ones', async () => {
    const fake = createFakePorts({
      source: URL_SOURCE,
      html: articleHtml(6),
      llm: (request) =>
        request.jsonSchema?.name === 'index_selection'
          ? {
              text: '{"keep":[0,1,2]}',
              usage: { promptTokens: 50, completionTokens: 5, costUsd: 0.0001 },
            }
          : undefined,
    });

    const outcome = await runChapter(CHAPTER_ID, fake.ports);

    expect(outcome.status).toBe('ready');
    const text = fake.state.sourceText.get(CHAPTER_ID) ?? '';
    expect(text).toContain('day 0');
    expect(text).toContain('day 2');
    expect(text).not.toContain('day 4');
    expect(fake.job('clean')).toMatchObject({ status: 'done', model: MODELS.cleanup });
    const selection = fake.state.llmCalls.find(
      (c) => c.request.jsonSchema?.name === 'index_selection',
    );
    expect(selection?.model).toBe(MODELS.cleanup);
    expect(fake.state.ledger.filter((e) => e.stage === 'extract')).toHaveLength(1);
  });

  it('keeps every block when the cleanup reply is malformed, so a bad reply cannot blank a chapter', async () => {
    const fake = createFakePorts({
      source: URL_SOURCE,
      html: articleHtml(6),
      llm: (request) =>
        request.jsonSchema?.name === 'index_selection'
          ? { text: 'not json at all', usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 } }
          : undefined,
    });
    const outcome = await runChapter(CHAPTER_ID, fake.ports);
    expect(outcome.status).toBe('ready');
    expect(fake.state.sourceText.get(CHAPTER_ID)).toContain('day 5');
  });

  it('fails a scanned PDF with a typed error, then re-runs it with OCR when asked', async () => {
    const scan = {
      text: 'Scan 1',
      pages: ['Scan 1', '', ''],
      model: 'pdf/parser',
      usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    };
    const ocr = {
      text: longText(6, 300),
      pages: [longText(6, 300)],
      model: 'pdf/ocr',
      usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.5 },
    };
    const fake = createFakePorts({
      source: { kind: 'pdf', fileUri: 'file:///scan.pdf', fileName: 'Scan.pdf' },
      pdf: (engine) => (engine === 'mistral-ocr' ? ocr : scan),
    });

    const first = await runChapter(CHAPTER_ID, fake.ports);
    expect(first).toMatchObject({
      status: 'failed',
      stage: 'extract',
      error: { code: 'CONTENT_EMPTY', retryable: false, detail: 'scanned_pdf' },
    });
    expect(fake.chapter().status).toBe('failed');

    const second = await runChapter(CHAPTER_ID, fake.ports, { pdfEngine: 'mistral-ocr' });
    expect(second.status).toBe('ready');
    expect(fake.state.pdfCalls.map((c) => c.engine)).toEqual(['cloudflare-ai', 'mistral-ocr']);
  });
});

describe('runChapter: translation', () => {
  it('translates into the target language, sentence by sentence, and stores the result', async () => {
    const fake = createFakePorts({ sourceText: PASTED, targetLang: 'it' });
    const outcome = await runChapter(CHAPTER_ID, fake.ports);
    expect(outcome.status).toBe('ready');
    expect(fake.job('translate')?.status).toBe('done');
    const translated = fake.state.sentences.get(CHAPTER_ID)?.map((s) => s.translated);
    expect(translated?.every((t) => t?.startsWith('EN '))).toBe(true);
  });

  it('resumes after a translation failure without re-running extract, segment or analyze', async () => {
    let failTranslation = true;
    const fake = createFakePorts({
      sourceText: PASTED,
      targetLang: 'it',
      llm: (request) => {
        if (request.jsonSchema?.name === 'chapter_translation' && failTranslation)
          throw networkFailure();
        return undefined;
      },
    });

    const first = await runChapter(CHAPTER_ID, fake.ports);
    expect(first).toMatchObject({
      status: 'failed',
      stage: 'translate',
      error: { code: 'NETWORK' },
    });
    expect(fake.chapter().status).toBe('failed');
    expect(callsNamed(fake.state, 'chapter_analysis')).toBe(1);

    failTranslation = false;
    const { events, onEvent } = recorder();
    const second = await runChapter(CHAPTER_ID, fake.ports, { onEvent });

    expect(second.status).toBe('ready');
    expect(stageStatuses(events)).toEqual({
      extract: 'skipped',
      segment: 'skipped',
      analyze: 'skipped',
      translate: 'done',
      narrate: 'done',
    });
    expect(callsNamed(fake.state, 'chapter_analysis')).toBe(1);
    expect(fake.job('translate')?.status).toBe('done');
  });
});

describe('runChapter: changing settings', () => {
  it('re-runs only narrate when the voice changes, and regenerates every segment', async () => {
    const fake = createFakePorts({ sourceText: longText(4, 250), targetLang: 'en' });
    await runChapter(CHAPTER_ID, fake.ports);
    const firstTtsCalls = fake.state.ttsCalls.length;
    const llmCallsBefore = fake.state.llmCalls.length;

    const unchanged = recorder();
    expect((await runChapter(CHAPTER_ID, fake.ports, { onEvent: unchanged.onEvent })).status).toBe(
      'ready',
    );
    expect(fake.state.ttsCalls).toHaveLength(firstTtsCalls);
    expect(stageStatuses(unchanged.events)).toEqual({
      extract: 'skipped',
      segment: 'skipped',
      analyze: 'skipped',
      translate: 'skipped',
      narrate: 'skipped',
    });

    fake.state.narration = { ...fake.state.narration, voice: 'Puck' };
    const changed = recorder();
    expect((await runChapter(CHAPTER_ID, fake.ports, { onEvent: changed.onEvent })).status).toBe(
      'ready',
    );

    expect(fake.state.llmCalls).toHaveLength(llmCallsBefore);
    expect(fake.state.fetched).toHaveLength(0);
    expect(fake.state.ttsCalls.slice(firstTtsCalls).every((c) => c.voice === 'Puck')).toBe(true);
    expect(fake.state.ttsCalls.length - firstTtsCalls).toBe(firstTtsCalls);
    const ranStages = changed.events.flatMap((e) =>
      e.type === 'stage' && e.status === 'running' ? [e.stage] : [],
    );
    expect(ranStages).toEqual(['narrate']);
  });

  it('re-runs from translate when asked, leaving extract, segment and analyze alone', async () => {
    const fake = createFakePorts({ sourceText: PASTED, targetLang: 'it' });
    await runChapter(CHAPTER_ID, fake.ports);
    const analysisCalls = callsNamed(fake.state, 'chapter_analysis');

    fake.state.settings = { ...fake.state.settings, translationModel: 'translation/other' };
    const { events, onEvent } = recorder();
    await runChapter(CHAPTER_ID, fake.ports, { from: 'translate', onEvent });

    expect(callsNamed(fake.state, 'chapter_analysis')).toBe(analysisCalls);
    expect(events.some((e) => e.type === 'stage' && e.stage === 'extract')).toBe(false);
    expect(fake.job('translate')?.model).toBe('translation/other');
  });
});

describe('runChapter: cancellation and resume', () => {
  it('stops mid-narrate, keeps the saved segments, and resumes at the next missing one', async () => {
    const controller = new AbortController();
    let abortOnce = true;
    const fake = createFakePorts({
      sourceText: longText(12, 250),
      targetLang: 'en',
      tts: () => {
        if (abortOnce) {
          abortOnce = false;
          controller.abort();
        }
        return { bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null };
      },
    });

    const cancelled = await runChapter(CHAPTER_ID, fake.ports, { signal: controller.signal });

    // Analysis runs beside narration, so either of them may be the stage that observed the cancel.
    expect(cancelled.status).toBe('cancelled');
    expect(fake.chapter().status).toBe('draft');
    expect(fake.job('narrate')?.status).toBe('cancelled');
    expect(['done', 'cancelled']).toContain(fake.job('analyze')?.status);
    const saved = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(saved).toBeGreaterThan(0);

    const ttsBefore = fake.state.ttsCalls.length;
    const resumed = await runChapter(CHAPTER_ID, fake.ports);

    // The ramp plans this chapter in more segments than its characters alone suggest, so count them.
    const total = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(saved).toBeLessThan(total);
    expect(resumed.status).toBe('ready');
    expect(fake.state.ttsCalls.length - ttsBefore).toBe(total - saved);
  });

  it('reports cancellation of a stage before it starts as a cancelled run', async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = createFakePorts({ sourceText: PASTED });
    const outcome = await runChapter(CHAPTER_ID, fake.ports, { signal: controller.signal });
    expect(outcome.status).toBe('cancelled');
    expect(fake.state.llmCalls).toHaveLength(0);
  });
});

describe('runChapter: usage and cost accounting', () => {
  it('records one ledger entry per model call and speech call, and totals them in the cost events', async () => {
    const { events, onEvent } = recorder();
    const fake = createFakePorts({ sourceText: longText(4, 250), targetLang: 'en' });
    await runChapter(CHAPTER_ID, fake.ports, { onEvent });

    const ledgerByStage = (stage: Stage) => fake.state.ledger.filter((e) => e.stage === stage);
    expect(ledgerByStage('analyze')).toHaveLength(1);
    expect(ledgerByStage('analyze')[0]).toMatchObject({
      model: MODELS.analysis,
      promptTokens: 100,
      completionTokens: 40,
      costUsd: 0.001,
    });
    expect(ledgerByStage('narrate')).toHaveLength(
      fake.state.segments.get(CHAPTER_ID)?.length ?? -1,
    );
    for (const entry of ledgerByStage('narrate')) {
      expect(entry.audioSeconds).toBeGreaterThan(0);
      expect(entry.costUsd).toBeGreaterThan(0);
    }

    const ledgerTotal = fake.state.ledger.reduce((sum, e) => sum + e.costUsd, 0);
    const lastCost = events.filter((e) => e.type === 'cost').at(-1);
    expect(lastCost?.type === 'cost' ? lastCost.totalUsd : NaN).toBeCloseTo(ledgerTotal, 12);
    expect(fake.job('analyze')?.costUsd).toBeCloseTo(0.001, 12);
  });

  it('streams segments in order as each one is saved', async () => {
    const { events, onEvent } = recorder();
    const fake = createFakePorts({ sourceText: longText(5, 250), targetLang: 'en' });
    await runChapter(CHAPTER_ID, fake.ports, { onEvent });
    const ready = events.flatMap((e) => (e.type === 'segmentReady' ? [e.segment.idx] : []));
    expect(ready).toEqual(fake.state.segments.get(CHAPTER_ID)?.map((s) => s.idx));
    expect(ready).toEqual([...ready].sort((a, b) => a - b));
  });
});

describe('runChapter: job timing', () => {
  it('stamps a running job with its start and no finish, and a finished job with both', async () => {
    const fake = createFakePorts({ sourceText: longText(4, 300), targetLang: 'en' });
    const seenRunning: { stage: string; startedAt: number | null; finishedAt: number | null }[] =
      [];

    await runChapter(CHAPTER_ID, fake.ports, {
      onEvent: (event) => {
        if (event.type === 'stage' && event.status === 'running') {
          const job = fake.job(event.stage);
          seenRunning.push({
            stage: event.stage,
            startedAt: job?.startedAt ?? null,
            finishedAt: job?.finishedAt ?? null,
          });
        }
      },
    });

    const narrating = seenRunning.find((entry) => entry.stage === 'narrate');
    expect(narrating?.startedAt).not.toBeNull();
    expect(narrating?.finishedAt).toBeNull();
    // This chapter has no source language, so translation is skipped and never runs.
    expect(fake.job('translate')?.status).toBe('skipped');
    for (const stage of ['extract', 'segment', 'analyze', 'narrate'] as const) {
      const job = fake.job(stage);
      expect(job?.status).toBe('done');
      expect(job?.startedAt).not.toBeNull();
      expect(job?.finishedAt).not.toBeNull();
      expect(job?.finishedAt ?? 0).toBeGreaterThanOrEqual(job?.startedAt ?? Infinity);
    }
  });

  it('keeps the start and stamps the finish of a failed job', async () => {
    const fake = createFakePorts({
      sourceText: longText(2, 300),
      targetLang: null,
      tts: () => {
        throw new StageFailure('NETWORK', 'No connection.', { retryable: true });
      },
    });

    await runChapter(CHAPTER_ID, fake.ports);

    const job = fake.job('narrate');
    expect(job?.status).toBe('failed');
    expect(job?.startedAt).not.toBeNull();
    expect(job?.finishedAt).not.toBeNull();
  });
});

describe('runChapter: a run its watchdog stops', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fails the chapter with the stall error instead of reporting a cancellation', async () => {
    const fake = createFakePorts({
      sourceText: longText(12, 250),
      targetLang: 'en',
      // The narration call never answers, and it honours the abort, so every try stalls.
      tts: (_text, _profile, signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    });
    const { events, onEvent } = recorder();

    const outcome = runChapter(CHAPTER_ID, fake.ports, {
      onEvent,
      clock: { now: () => Date.now() },
    });
    await jest.advanceTimersByTimeAsync(3 * STALL_AFTER_MS + 1_000);

    await expect(outcome).resolves.toEqual({
      status: 'failed',
      stage: 'narrate',
      error: STALLED_ERROR,
    });
    expect(fake.chapter().status).toBe('failed');
    expect(events).toContainEqual({
      type: 'error',
      chapterId: CHAPTER_ID,
      stage: 'narrate',
      error: STALLED_ERROR,
    });
    expect(events.some((e) => e.type === 'error' && e.error.code === 'CANCELLED')).toBe(false);
  });

  it('still reports a plain cancellation as cancelled when nothing stalls', async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = createFakePorts({ sourceText: PASTED });

    const outcome = await runChapter(CHAPTER_ID, fake.ports, { signal: controller.signal });

    expect(outcome.status).toBe('cancelled');
  });
});
