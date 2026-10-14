import { StageFailure } from '@/core/pipeline/errors';
import { PDF_MAX_BYTES } from '@/core/pipeline/limits';
import type { OpenRouterClient } from '@/services/openrouter';

import { createPdfTextSource, fileNameOf } from './pdf-text-source';

import type { LibraryFiles } from '../library-files';

function filesOf(size: number | null) {
  const readBase64 = jest.fn(async () => 'AAAA');
  const files = { readBase64, sizeOf: jest.fn(async () => size) } as unknown as Pick<
    LibraryFiles,
    'readBase64' | 'sizeOf'
  >;
  return { files, readBase64 };
}

function clientOf() {
  const parsePdf = jest.fn(async () => ({
    text: 'Chapter one.',
    usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    generationId: 'gen-1',
    model: 'cleanup/model',
  }));
  return { client: { parsePdf } as unknown as Pick<OpenRouterClient, 'parsePdf'>, parsePdf };
}

const signal = new AbortController().signal;

describe('createPdfTextSource', () => {
  it('refuses a PDF over the limit before reading it', async () => {
    const { files, readBase64 } = filesOf(PDF_MAX_BYTES + 1);
    const { client, parsePdf } = clientOf();
    const source = createPdfTextSource({
      openrouter: client,
      files,
      parserModel: () => 'cleanup/model',
    });

    const error = await source
      .extract({ fileUri: 'file:///big.pdf', engine: 'cloudflare-ai', signal })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StageFailure);
    expect((error as StageFailure).error).toMatchObject({
      code: 'INPUT_TOO_LONG',
      message: 'This PDF is 26 MB. Lectio can read PDFs up to 25 MB.',
      retryable: false,
    });
    expect(readBase64).not.toHaveBeenCalled();
    expect(parsePdf).not.toHaveBeenCalled();
  });

  it('reads and parses a PDF within the limit, and keeps the usage and generation id', async () => {
    const { files, readBase64 } = filesOf(1024);
    const { client } = clientOf();
    const source = createPdfTextSource({
      openrouter: client,
      files,
      parserModel: () => 'cleanup/model',
    });

    const result = await source.extract({ fileUri: 'file:///a.pdf', engine: 'cloudflare-ai', signal });

    expect(readBase64).toHaveBeenCalledWith('file:///a.pdf');
    expect(result.text).toBe('Chapter one.');
    expect(result.generationId).toBe('gen-1');
  });

  it('reads a PDF whose size the platform does not report', async () => {
    const { files, readBase64 } = filesOf(null);
    const { client } = clientOf();
    const source = createPdfTextSource({
      openrouter: client,
      files,
      parserModel: () => 'cleanup/model',
    });

    await source.extract({ fileUri: 'file:///a.pdf', engine: 'cloudflare-ai', signal });

    expect(readBase64).toHaveBeenCalled();
  });
});

describe('fileNameOf', () => {
  it('takes the decoded last path segment, without a query', () => {
    expect(fileNameOf('file:///cache/My%20Book.pdf?x=1')).toBe('My Book.pdf');
    expect(fileNameOf('')).toBe('document.pdf');
  });
});
