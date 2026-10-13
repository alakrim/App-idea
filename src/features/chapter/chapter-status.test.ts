import type { PipelineError } from '@/core/domain';
import { chapterRow, id } from '@/db/__fixtures__/factories';
import type { ChapterProgress } from '@/features/pipeline/facade';

import {
  ELAPSED_SHOWN_AFTER_MS,
  isScannedPdfFailure,
  rowStateOf,
  statusLine,
} from './chapter-status';

const idle: ChapterProgress | null = null;
const NOW = 1_700_000_100_000;

function progress(
  state: ChapterProgress['state'],
  stages: ChapterProgress['stages'] = [],
  reconnecting = false,
): ChapterProgress {
  return {
    chapterId: id(1),
    state,
    stages,
    overall: 0,
    readySegments: 0,
    totalSegments: null,
    costUsdSoFar: 0,
    error: null,
    reconnecting,
  };
}

/** A running stage, as the facade reports it. */
function running(
  stage: ChapterProgress['stages'][number]['stage'],
  fields: Partial<ChapterProgress['stages'][number]> = {},
): ChapterProgress['stages'][number] {
  return { stage, status: 'running', progress: 0, since: null, passages: null, ...fields };
}

describe('rowStateOf', () => {
  it('lets live progress win over the stored status', () => {
    const chapter = chapterRow(1, 1, 1, { status: 'draft' });

    expect(rowStateOf(chapter, progress('running'))).toBe('processing');
    expect(rowStateOf(chapter, progress('queued'))).toBe('processing');
    expect(rowStateOf(chapter, progress('failed'))).toBe('failed');
    expect(rowStateOf(chapter, idle)).toBe('draft');
  });
});

describe('statusLine', () => {
  it('names the running stage with its percentage', () => {
    const chapter = chapterRow(1, 1, 1, { status: 'processing' });
    const live = progress('running', [running('analyze', { progress: 0.42 })]);

    expect(statusLine('processing', chapter, live, null, NOW)).toBe('Analyzing · 42%');
  });

  it('shows the passage being narrated, counted from one', () => {
    const chapter = chapterRow(1, 1, 1, { status: 'processing' });
    const live = progress('running', [
      running('narrate', { progress: 4 / 18, passages: { done: 4, total: 18 } }),
    ]);

    expect(statusLine('processing', chapter, live, null, NOW)).toBe('Narrating · passage 5 of 18');
  });

  it('never counts past the last passage', () => {
    const chapter = chapterRow(1, 1, 1, { status: 'processing' });
    const live = progress('running', [
      running('narrate', { progress: 1, passages: { done: 18, total: 18 } }),
    ]);

    expect(statusLine('processing', chapter, live, null, NOW)).toBe('Narrating · passage 18 of 18');
  });

  it('adds the elapsed time of a step once it has run for 30 seconds', () => {
    const chapter = chapterRow(1, 1, 1, { status: 'processing' });
    const justStarted = progress('running', [
      running('narrate', { progress: 0.5, passages: { done: 2, total: 6 }, since: NOW - 29_000 }),
    ]);
    const slow = progress('running', [
      running('narrate', {
        progress: 0.5,
        passages: { done: 2, total: 6 },
        since: NOW - ELAPSED_SHOWN_AFTER_MS,
      }),
    ]);

    expect(statusLine('processing', chapter, justStarted, null, NOW)).toBe(
      'Narrating · passage 3 of 6',
    );
    expect(statusLine('processing', chapter, slow, null, NOW)).toBe(
      'Narrating · passage 3 of 6 · 30 s',
    );
  });

  it('says it is reconnecting after the app came back, and never shows a blank line while processing', () => {
    const chapter = chapterRow(1, 1, 1, { status: 'processing' });
    const reconnecting = progress('running', [running('narrate')], true);

    expect(statusLine('processing', chapter, reconnecting, null, NOW)).toBe('Reconnecting…');
    expect(statusLine('processing', chapter, null, null, NOW)).toBe('Queued…');
  });

  it('shows the error message for a failed chapter, and the duration once ready', () => {
    const error: PipelineError = { code: 'NETWORK', message: 'No connection.', retryable: true };

    expect(statusLine('failed', chapterRow(1, 1, 1), null, error, NOW)).toBe('No connection.');
    expect(
      statusLine('ready', chapterRow(1, 1, 1, { durationMs: 25 * 60_000 }), null, null, NOW),
    ).toBe('Ready · 25 m');
  });
});

describe('isScannedPdfFailure', () => {
  it('is true only for a PDF whose extraction found no text', () => {
    const pdf = chapterRow(1, 1, 1, {
      source: { kind: 'pdf', fileUri: 'file:///a.pdf', fileName: 'a.pdf' },
    });
    const empty: PipelineError = { code: 'CONTENT_EMPTY', message: 'No text.', retryable: false };

    expect(isScannedPdfFailure(pdf, empty)).toBe(true);
    expect(isScannedPdfFailure(chapterRow(1, 1, 1), empty)).toBe(false);
    expect(isScannedPdfFailure(pdf, null)).toBe(false);
  });
});
