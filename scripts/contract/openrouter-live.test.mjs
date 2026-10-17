// Offline tests for the public catalogue reader and the recording fetch (brief C1). No network.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OpenRouterUnreachableError, USER_AGENT, createPublicReader } from './openrouter-live.mjs';
import { createRecorder } from './scenarios.mjs';

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function readerWith(handler) {
  const calls = [];
  const sleeps = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url);
  };
  const reader = createPublicReader({
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    gapMs: 200,
    baseUrl: 'https://example.test/api/v1',
  });
  return { reader, calls, sleeps };
}

describe('createPublicReader', () => {
  it('reads the model list with a descriptive User-Agent and no key', async () => {
    const { reader, calls } = readerWith(() => jsonResponse({ data: [{ id: 'a/b' }] }));
    const models = await reader.listModels('speech');
    assert.deepEqual(models, [{ id: 'a/b' }]);
    assert.equal(calls[0].url, 'https://example.test/api/v1/models?output_modalities=speech');
    assert.equal(calls[0].init.headers['User-Agent'], USER_AGENT);
    assert.equal(calls[0].init.headers.Authorization, undefined);
  });

  it('spaces requests by the gap, and never before the first request', async () => {
    const { reader, sleeps } = readerWith((url) =>
      url.includes('/endpoints')
        ? jsonResponse({ data: { endpoints: [] } })
        : jsonResponse({ data: [] }),
    );
    await reader.listModels('text');
    await reader.listEndpoints('a/b');
    await reader.listEndpoints('c/d');
    assert.deepEqual(sleeps, [200, 200]);
  });

  it('returns null for an unknown model (404 on /endpoints), which is a verdict, not a failure', async () => {
    const { reader } = readerWith(() => jsonResponse({ error: 'not found' }, 404));
    assert.equal(await reader.listEndpoints('nope/none'), null);
  });

  it('reads the endpoint list of a model, including ids with a colon', async () => {
    const { reader, calls } = readerWith(() =>
      jsonResponse({ data: { endpoints: [{ tag: 'p', supported_parameters: [] }] } }),
    );
    const endpoints = await reader.listEndpoints('fish-audio/s2.1-pro-free:free');
    assert.equal(endpoints.length, 1);
    assert.equal(
      calls[0].url,
      'https://example.test/api/v1/models/fish-audio/s2.1-pro-free:free/endpoints',
    );
  });

  it('raises OpenRouterUnreachableError on a network error, with the reason', async () => {
    const reader = createPublicReader({
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
      sleep: async () => {},
      baseUrl: 'https://example.test/api/v1',
    });
    await assert.rejects(reader.listModels('text'), (error) => {
      assert.ok(error instanceof OpenRouterUnreachableError);
      assert.match(error.message, /could not reach OpenRouter \(fetch failed\)/);
      return true;
    });
  });

  it('raises OpenRouterUnreachableError for a server error, with its status', async () => {
    const { reader } = readerWith(() => jsonResponse({}, 503));
    await assert.rejects(reader.listModels('text'), (error) => {
      assert.ok(error instanceof OpenRouterUnreachableError);
      assert.equal(error.status, 503);
      return true;
    });
  });

  it('raises OpenRouterUnreachableError for a body that is not JSON', async () => {
    const { reader } = readerWith(() => new Response('<html>', { status: 200 }));
    await assert.rejects(reader.listModels('text'), OpenRouterUnreachableError);
  });

  it('raises OpenRouterUnreachableError when the model list has the wrong shape', async () => {
    const { reader } = readerWith(() => jsonResponse({ unexpected: true }));
    await assert.rejects(reader.listModels('text'), OpenRouterUnreachableError);
  });
});

describe('createRecorder', () => {
  it('answers the catalogue GETs from the given data and records chat and speech bodies', async () => {
    const recorder = createRecorder({ text: [{ id: 'a/b' }], speech: [] });
    const models = await recorder.fetchImpl(
      'https://openrouter.ai/api/v1/models?output_modalities=text',
      { method: 'GET' },
    );
    assert.deepEqual((await models.json()).data, [{ id: 'a/b' }]);

    await recorder.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'a/b', response_format: {} }),
    });
    await recorder.fetchImpl('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      body: JSON.stringify({ model: 'c/d', input: 'x' }),
    });
    assert.deepEqual(
      recorder.posts.map((post) => post.path),
      ['chat/completions', 'audio/speech'],
    );
  });

  it('refuses any request it does not expect, so nothing reaches the network by accident', async () => {
    const recorder = createRecorder({ text: [], speech: [] });
    await assert.rejects(
      recorder.fetchImpl('https://openrouter.ai/api/v1/key', { method: 'GET' }),
      /offline recorder refused GET \/api\/v1\/key/,
    );
  });
});
