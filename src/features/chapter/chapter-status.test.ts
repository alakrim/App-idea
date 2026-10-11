import type { PipelineError } from '@/core/domain';
import { chapterRow, id } from '@/db/__fixtures__/factories';
import type { ChapterProgress } from '@/features/pipeline/facade';

import { isScannedPdfFailure, rowStateOf, statusLine } from './chapter-status';

const idle: ChapterProgress | null = null;

function progress(
  state: ChapterProgress['state'],
  stages: ChapterProgress['stages'] = [],
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
  };
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
    const running = progress('running', [{ stage: 'analyze', status: 'running', progress: 0.42 }]);

    expect(statusLine('processing', chapter, running, null)).toBe('Analyzing · 42%');
  });

  it('shows the error message for a failed chapter, and the duration once ready', () => {
    const error: PipelineError = { code: 'NETWORK', message: 'No connection.', retryable: true };

    expect(statusLine('failed', chapterRow(1, 1, 1), null, error)).toBe('No connection.');
    expect(statusLine('ready', chapterRow(1, 1, 1, { durationMs: 25 * 60_000 }), null, null)).toBe(
      'Ready · 25 m',
    );
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
