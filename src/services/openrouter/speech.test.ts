import { createFakeFetch, errorResponse } from './__fixtures__/fake-fetch';
import { createOpenRouterClient } from './client';
import { PipelineFailure } from './errors';

import type { Route } from './__fixtures__/fake-fetch';

function audioResponse(bytes: number[], contentType = 'audio/mpeg'): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType, 'x-generation-id': 'gen-speech-1' },
  });
}

function makeClient(route: Route, maxSpeechChars?: number) {
  const fake = createFakeFetch(route);
  const client = createOpenRouterClient({
    getApiKey: async () => 'sk-or-v1-TESTKEY',
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: fake.fetchImpl,
    maxRetries: 0,
    ...(maxSpeechChars === undefined ? {} : { maxSpeechChars }),
  });
  return { client, calls: fake.calls };
}

const speechInput = {
  model: 'google/gemini-3.8-flash-lite-tts',
  voice: 'Kore',
  format: 'mp3' as const,
  instructions: 'Calm audiobook narrator.',
};

describe('synthesizeSpeech', () => {
  it('posts the speech request and returns the audio bytes', async () => {
    const { client, calls } = makeClient(() => audioResponse([1, 2, 3]));

    const result = await client.synthesizeSpeech({ ...speechInput, input: 'Chapter one.' });

    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect(calls[0]?.body).toEqual({
      model: 'google/gemini-3.8-flash-lite-tts',
      input: 'Chapter one.',
      voice: 'Kore',
      response_format: 'mp3',
      instructions: 'Calm audiobook narrator.',
    });
    expect(calls[0]?.headers.Accept).toBe('audio/*');
    expect(new Uint8Array(result.audio)).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.contentType).toBe('audio/mpeg');
    expect(result.generationId).toBe('gen-speech-1');
    expect(result.costUsd).toBeNull();
  });

  it('rejects input over the default 4,000 characters before calling the API', async () => {
    const { client, calls } = makeClient(() => audioResponse([1]));

    const error = await client
      .synthesizeSpeech({ ...speechInput, input: 'a'.repeat(4001) })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PipelineFailure);
    expect((error as PipelineFailure).error.code).toBe('INPUT_TOO_LONG');
    expect((error as PipelineFailure).error.retryable).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('accepts exactly the default limit', async () => {
    const { client, calls } = makeClient(() => audioResponse([1]));
    await client.synthesizeSpeech({ ...speechInput, input: 'a'.repeat(4000) });
    expect(calls).toHaveLength(1);
  });

  it('honours a configured maximum length', async () => {
    const { client, calls } = makeClient(() => audioResponse([1]), 10);
    await expect(
      client.synthesizeSpeech({ ...speechInput, input: 'a'.repeat(11) }),
    ).rejects.toBeInstanceOf(PipelineFailure);
    expect(calls).toHaveLength(0);
  });

  it('fails with CONTENT_EMPTY for blank input', async () => {
    const { client, calls } = makeClient(() => audioResponse([1]));
    const error = await client
      .synthesizeSpeech({ ...speechInput, input: '   ' })
      .catch((caught: unknown) => caught);
    expect((error as PipelineFailure).error.code).toBe('CONTENT_EMPTY');
    expect(calls).toHaveLength(0);
  });

  it('treats an empty audio body as a retryable failure', async () => {
    const { client } = makeClient(() => audioResponse([]));
    const error = await client
      .synthesizeSpeech({ ...speechInput, input: 'Hi.' })
      .catch((caught: unknown) => caught);
    expect((error as PipelineFailure).error.retryable).toBe(true);
  });

  it('passes HTTP errors through the shared mapping', async () => {
    const { client } = makeClient(() => errorResponse(402, 'no credits'));
    const error = await client
      .synthesizeSpeech({ ...speechInput, input: 'Hi.' })
      .catch((caught: unknown) => caught);
    expect((error as PipelineFailure).error.code).toBe('INSUFFICIENT_CREDITS');
  });
});
