import { id, seriesRow } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';

import { createFakePipeline, fakeEstimate, fakePreview } from './fake-facade';

import type { ChapterProgress } from './facade';

// Long enough for every stage of the fake to finish at speed 1.
const FULL_RUN_MS = 20_000;

function setup(options: { targetLang?: string | null } = {}) {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { sourceLang: 'en', targetLang: options.targetLang ?? null }));
  let counter = 0;
  const pipeline = createFakePipeline({
    db,
    newId: () => id(700 + counter++),
    now: () => 1_700_000_000_000,
    previewMs: 10,
  });
  return { db, pipeline };
}

function latest(listener: jest.Mock): ChapterProgress {
  const calls = listener.mock.calls;
  return calls[calls.length - 1]?.[0] as ChapterProgress;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('fake pipeline: estimates and previews', () => {
  it('splits an estimate into stages, with a range around the total', () => {
    const estimate = fakeEstimate({ chars: 36_000, sourceLang: 'en', targetLang: 'it' });

    const total = estimate.totalUsd ?? Number.NaN;
    expect(total).toBeGreaterThan(0);
    expect(estimate.lowUsd ?? Number.NaN).toBeLessThan(total);
    expect(estimate.highUsd ?? Number.NaN).toBeGreaterThan(total);
    expect(estimate.lines.map((line) => line.stage)).toContain('translate');
    expect(
      fakeEstimate({ chars: 36_000, sourceLang: 'en', targetLang: null }).lines.map((l) => l.stage),
    ).not.toContain('translate');
  });

  it('marks extraction quality from the URL path, and rejects offline links', () => {
    expect(fakePreview('https://example.com/the-night-harbour').title).toBe('The night harbour');
    expect(fakePreview('https://example.com/empty').quality).toBe('empty');
    expect(fakePreview('https://example.com/render').quality).toBe('needs_render');
    expect(() => fakePreview('https://example.com/offline')).toThrow('Network request failed');
  });
});

describe('fake pipeline: processing', () => {
  it('creates the chapter, runs every stage, and writes the text, translations and jobs', async () => {
    const { db, pipeline } = setup({ targetLang: 'it' });
    const chapterId = await pipeline.createChapter({
      seriesId: id(1),
      title: null,
      source: { kind: 'text', text: 'First sentence here. Second one follows.', label: 'Pasted' },
    });
    const listener = jest.fn();
    pipeline.subscribe(chapterId, listener);

    pipeline.enqueue(chapterId);
    jest.advanceTimersByTime(FULL_RUN_MS);

    expect(latest(listener).state).toBe('ready');
    expect(chapterRepo.get(db, chapterId)?.status).toBe('ready');
    expect(
      jobRepo
        .listForChapter(db, chapterId)
        .every((job) => job.status === 'done' || job.status === 'skipped'),
    ).toBe(true);
    const text = textRepo.getRange(db, chapterId, 0, 10);
    expect(text.map((s) => s.text)).toEqual(['First sentence here.', 'Second one follows.']);
    expect(text[0]?.translated).toBe('[it] First sentence here.');
  });

  it('skips translation when the series has no target language', async () => {
    const { db, pipeline } = setup({ targetLang: null });
    const chapterId = await pipeline.createChapter({
      seriesId: id(1),
      title: 'Plain',
      source: { kind: 'text', text: 'Just one sentence.', label: 'Pasted' },
    });

    pipeline.enqueue(chapterId);
    jest.advanceTimersByTime(FULL_RUN_MS);

    expect(jobRepo.get(db, chapterId, 'translate')?.status).toBe('skipped');
    expect(textRepo.getRange(db, chapterId, 0, 5)[0]?.translated).toBeNull();
  });

  it('stops a scanned PDF at extraction, then finishes after OCR is confirmed', async () => {
    const { db, pipeline } = setup();
    const chapterId = await pipeline.createChapter({
      seriesId: id(1),
      title: 'Scan',
      source: { kind: 'pdf', fileUri: 'file:///cache/scan.pdf', fileName: 'Scan.pdf' },
    });
    const listener = jest.fn();
    pipeline.subscribe(chapterId, listener);

    pipeline.enqueue(chapterId);
    jest.advanceTimersByTime(FULL_RUN_MS);
    expect(latest(listener)).toMatchObject({
      state: 'failed',
      error: { code: 'CONTENT_EMPTY', retryable: false, detail: 'scanned-pdf' },
    });
    expect(chapterRepo.get(db, chapterId)?.status).toBe('failed');

    pipeline.retryWithOcr(chapterId);
    jest.advanceTimersByTime(FULL_RUN_MS);
    expect(latest(listener).state).toBe('ready');
    expect(chapterRepo.get(db, chapterId)?.status).toBe('ready');
  });

  it('resumes a failed URL from the failed stage on retry', async () => {
    const { pipeline } = setup();
    const chapterId = await pipeline.createChapter({
      seriesId: id(1),
      title: null,
      source: { kind: 'url', url: 'https://example.com/fail/page' },
    });
    const listener = jest.fn();
    pipeline.subscribe(chapterId, listener);

    pipeline.enqueue(chapterId);
    jest.advanceTimersByTime(FULL_RUN_MS);
    expect(latest(listener).error).toMatchObject({ code: 'NETWORK', retryable: true });

    pipeline.retry(chapterId);
    expect(latest(listener).state).toBe('running');
  });

  it('cancels unfinished work and reports the chapter as cancelled', async () => {
    const { db, pipeline } = setup();
    const chapterId = await pipeline.createChapter({
      seriesId: id(1),
      title: 'Cancel me',
      source: { kind: 'text', text: 'Sentence one. Sentence two.', label: 'Pasted' },
    });
    const listener = jest.fn();
    pipeline.subscribe(chapterId, listener);

    pipeline.enqueue(chapterId);
    jest.advanceTimersByTime(300);
    pipeline.cancel(chapterId);
    jest.advanceTimersByTime(FULL_RUN_MS);

    expect(latest(listener).state).toBe('cancelled');
    expect(chapterRepo.get(db, chapterId)?.status).toBe('draft');
  });
});

describe('fake pipeline: subscriptions', () => {
  it('emits the current snapshot at once and stops after unsubscribe', async () => {
    const { pipeline } = setup();
    const chapterId = await pipeline.createChapter({
      seriesId: id(1),
      title: 'Quiet',
      source: { kind: 'text', text: 'A line.', label: 'Pasted' },
    });
    const listener = jest.fn();

    const unsubscribe = pipeline.subscribe(chapterId, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(latest(listener)).toMatchObject({ state: 'idle', overall: 0 });

    unsubscribe();
    pipeline.enqueue(chapterId);
    jest.advanceTimersByTime(FULL_RUN_MS);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
