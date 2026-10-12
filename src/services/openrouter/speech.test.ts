import { FREE_NARRATOR_DAILY_LIMIT_MESSAGE } from '@/core/narration/options';

import { createFakeFetch, errorResponse, hangUntilAborted } from './__fixtures__/fake-fetch';
import { createOpenRouterClient } from './client';
import { PipelineFailure } from './errors';
import { formatSupportedBy } from './speech';

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

describe('synthesizeSpeech timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits 180 seconds for a passage, which is longer than the 120-second chat timeout', async () => {
    const { client, calls } = makeClient(hangUntilAborted);
    const outcome = client
      .synthesizeSpeech({ ...speechInput, input: 'Chapter one.' })
      .catch((caught: unknown) => caught);

    await jest.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(179_999);
    expect(calls[0]?.signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(await outcome).toBeInstanceOf(PipelineFailure);
    expect(((await outcome) as PipelineFailure).error).toMatchObject({
      code: 'NETWORK',
      retryable: true,
    });
  });
});

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

  describe('synthesizeSpeech PCM-only models', () => {
    const PCM_CONTENT_TYPE = 'audio/pcm;rate=24000;channels=1';
    const pcmReply = () =>
      new Response(new Uint8Array([1, 0, 2, 0]), {
        status: 200,
        headers: { 'content-type': PCM_CONTENT_TYPE, 'x-generation-id': 'gen-pcm-1' },
      });
    const refusesMp3 = (call: { body: unknown }) =>
      (call.body as { response_format: string }).response_format === 'mp3'
        ? errorResponse(400, 'Gemini TTS only supports response_format="pcm"')
        : pcmReply();

    it('retries once as pcm after the live mp3 refusal, and reports the format it got', async () => {
      const { client, calls } = makeClient(refusesMp3);

      const result = await client.synthesizeSpeech({
        ...speechInput,
        format: 'mp3',
        input: 'Chapter one.',
      });

      expect(
        calls.map((call) => (call.body as { response_format: string }).response_format),
      ).toEqual(['mp3', 'pcm']);
      expect(result.formatUsed).toBe('pcm');
      expect(result.contentType).toBe(PCM_CONTENT_TYPE);
      expect(new Uint8Array(result.audio)).toEqual(new Uint8Array([1, 0, 2, 0]));
    });

    it('retries only once, and surfaces the refusal when pcm is refused too', async () => {
      const { client, calls } = makeClient(() =>
        errorResponse(400, 'Gemini TTS only supports response_format="pcm"'),
      );

      const error = await client
        .synthesizeSpeech({ ...speechInput, format: 'mp3', input: 'Hi.' })
        .catch((caught: unknown) => caught);

      expect(calls).toHaveLength(2);
      expect(error).toBeInstanceOf(PipelineFailure);
      expect((error as PipelineFailure).error).toMatchObject({
        code: 'MODEL_UNAVAILABLE',
        retryable: false,
      });
    });

    it('does not retry a pcm request, and an mp3 success reports mp3', async () => {
      const pcmOnly = makeClient(() =>
        errorResponse(400, 'Gemini TTS only supports response_format="pcm"'),
      );
      await expect(
        pcmOnly.client.synthesizeSpeech({ ...speechInput, format: 'pcm', input: 'Hi.' }),
      ).rejects.toBeInstanceOf(PipelineFailure);
      expect(pcmOnly.calls).toHaveLength(1);

      const mp3 = makeClient(() => audioResponse([1, 2, 3]));
      const result = await mp3.client.synthesizeSpeech({
        ...speechInput,
        format: 'mp3',
        input: 'Hi.',
      });
      expect(result.formatUsed).toBe('mp3');
      expect(mp3.calls).toHaveLength(1);
    });
  });
});

describe('synthesizeSpeech: optional voice and format self-heal', () => {
  it('leaves the voice out of the request for a model that takes none', async () => {
    const { client, calls } = makeClient(() => audioResponse([1, 2, 3]));

    await client.synthesizeSpeech({
      ...speechInput,
      model: 'fish-audio/s2.1-pro-free:free',
      voice: '',
      format: 'mp3',
      input: 'Chapter one.',
    });

    expect(calls[0]?.body).toEqual({
      model: 'fish-audio/s2.1-pro-free:free',
      input: 'Chapter one.',
      response_format: 'mp3',
      instructions: 'Calm audiobook narrator.',
    });
    expect(calls[0]?.body).not.toHaveProperty('voice');
  });

  it('retries once in the WAV format a model names, and reports WAV', async () => {
    const wavReply = () =>
      new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      });
    const { client, calls } = makeClient((call) =>
      (call.body as { response_format: string }).response_format === 'mp3'
        ? errorResponse(400, 'This model only supports response_format=wav')
        : wavReply(),
    );

    const result = await client.synthesizeSpeech({
      ...speechInput,
      model: 'fish-audio/s2.1-pro-free:free',
      voice: '',
      format: 'mp3',
      input: 'Hi.',
    });

    expect(calls.map((call) => (call.body as { response_format: string }).response_format)).toEqual(
      ['mp3', 'wav'],
    );
    expect(result.formatUsed).toBe('wav');
    expect(result.contentType).toBe('audio/wav');
  });

  it('does not retry when the model names the format that was already asked for', async () => {
    const { client, calls } = makeClient(() =>
      errorResponse(400, 'This model only supports response_format=mp3'),
    );

    await expect(
      client.synthesizeSpeech({ ...speechInput, format: 'mp3', input: 'Hi.' }),
    ).rejects.toBeInstanceOf(PipelineFailure);
    expect(calls).toHaveLength(1);
  });

  it('does not retry on a refusal that names no format', async () => {
    const { client, calls } = makeClient(() =>
      errorResponse(400, 'This model does not support the speed setting'),
    );

    await expect(
      client.synthesizeSpeech({ ...speechInput, format: 'mp3', input: 'Hi.' }),
    ).rejects.toBeInstanceOf(PipelineFailure);
    expect(calls).toHaveLength(1);
  });
});

describe('formatSupportedBy', () => {
  it('reads the format from each wording OpenRouter uses', () => {
    expect(formatSupportedBy('Gemini TTS only supports response_format="pcm"', 'mp3')).toBe('pcm');
    expect(formatSupportedBy('only supports response_format=wav', 'mp3')).toBe('wav');
    expect(formatSupportedBy('Supported formats: mp3, wav', 'pcm')).toBe('mp3');
    expect(formatSupportedBy("supported response formats are 'wav'", 'mp3')).toBe('wav');
  });

  it('returns null when the message names no format, or the requested one', () => {
    expect(formatSupportedBy('something else went wrong', 'mp3')).toBeNull();
    expect(formatSupportedBy('only supports response_format="mp3"', 'mp3')).toBeNull();
    expect(formatSupportedBy('only supports response_format="flac"', 'mp3')).toBeNull();
  });
});

describe('synthesizeSpeech daily free-model limit', () => {
  it('stops at one request and says the narrator is used up for the day', async () => {
    const fake = createFakeFetch(() =>
      errorResponse(429, 'Rate limit exceeded: free-models-per-day'),
    );
    const client = createOpenRouterClient({
      getApiKey: async () => 'sk-or-v1-TESTKEY',
      appUrl: 'https://lectio.app',
      appTitle: 'Lectio',
      fetchImpl: fake.fetchImpl,
      maxRetries: 3,
      sleep: async () => undefined,
    });

    const error = await client
      .synthesizeSpeech({
        ...speechInput,
        model: 'fish-audio/s2.1-pro-free:free',
        voice: '',
        format: 'mp3',
        input: 'Hi.',
      })
      .catch((caught: unknown) => caught);

    expect(fake.calls).toHaveLength(1);
    expect(error).toBeInstanceOf(PipelineFailure);
    expect((error as PipelineFailure).error).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: false,
      message: FREE_NARRATOR_DAILY_LIMIT_MESSAGE,
    });
  });
});
