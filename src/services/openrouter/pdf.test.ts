import { chatReply, createFakeFetch } from './__fixtures__/fake-fetch';
import { createOpenRouterClient } from './client';
import { PipelineFailure } from './errors';

import type { Route } from './__fixtures__/fake-fetch';

function makeClient(route: Route) {
  const fake = createFakeFetch(route);
  const client = createOpenRouterClient({
    getApiKey: async () => 'sk-or-v1-TESTKEY',
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: fake.fetchImpl,
    maxRetries: 0,
  });
  return { client, calls: fake.calls };
}

const parsedAnnotation = (hash: string, texts: string[]) => ({
  type: 'file',
  file: {
    hash,
    name: 'chapter.pdf',
    content: texts.map((text) => ({ type: 'text', text })),
  },
});

const pdfInput = {
  base64: 'JVBERi0xLjQK',
  fileName: 'chapter.pdf',
  model: 'openai/gpt-5-nano',
};

describe('parsePdf', () => {
  it('sends the file as a data URL with the explicit engine', async () => {
    const { client, calls } = makeClient(() =>
      chatReply('OK', { annotations: [parsedAnnotation('h1', ['Hello world.'])] }),
    );

    await client.parsePdf({ ...pdfInput, engine: 'cloudflare-ai' });

    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0]?.body).toMatchObject({
      model: 'openai/gpt-5-nano',
      plugins: [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }],
      max_tokens: 5,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Reply with OK.' },
            {
              type: 'file',
              file: {
                filename: 'chapter.pdf',
                file_data: 'data:application/pdf;base64,JVBERi0xLjQK',
              },
            },
          ],
        },
      ],
    });
  });

  it('passes the OCR engine through when asked for it', async () => {
    const { client, calls } = makeClient(() =>
      chatReply('OK', { annotations: [parsedAnnotation('h2', ['Scanned page.'])] }),
    );
    await client.parsePdf({ ...pdfInput, engine: 'mistral-ocr' });
    expect(calls[0]?.body).toMatchObject({
      plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }],
    });
  });

  it('collects the parsed text from annotations, not from the model reply', async () => {
    const { client } = makeClient(() =>
      chatReply('OK', {
        annotations: [
          parsedAnnotation('h1', ['First page.', 'Second paragraph.']),
          { type: 'url_citation', url_citation: { url: 'https://example.com' } },
        ],
      }),
    );
    const result = await client.parsePdf({ ...pdfInput, engine: 'cloudflare-ai' });
    expect(result.text).toBe('First page.\n\nSecond paragraph.');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, costUsd: null });
    expect(result.generationId).toBe('gen-test-1');
  });

  it('skips a file annotation whose hash was already seen', async () => {
    const { client } = makeClient(() =>
      chatReply('OK', {
        annotations: [parsedAnnotation('same', ['Once.']), parsedAnnotation('same', ['Once.'])],
      }),
    );
    const result = await client.parsePdf({ ...pdfInput, engine: 'cloudflare-ai' });
    expect(result.text).toBe('Once.');
  });

  it('fails with CONTENT_EMPTY when nothing is parsed, so the caller can try OCR', async () => {
    const { client } = makeClient(() => chatReply('OK', { annotations: [] }));
    const error = await client
      .parsePdf({ ...pdfInput, engine: 'cloudflare-ai' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PipelineFailure);
    expect((error as PipelineFailure).error.code).toBe('CONTENT_EMPTY');
    expect((error as PipelineFailure).error.retryable).toBe(false);
  });
});
