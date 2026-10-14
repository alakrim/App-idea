import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import { createFreesoundClient } from './freesound-api.mjs';

const KEY = 'test-key-not-real-0123456789abcdef';
const SOUND = {
  id: 7,
  name: 'Rain',
  tags: ['rain'],
  duration: 90,
  license: 'http://creativecommons.org/publicdomain/zero/1.0/',
  avg_rating: 4.5,
  num_ratings: 10,
  num_downloads: 100,
  username: 'someone',
  url: 'https://freesound.org/people/someone/sounds/7/',
  previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/7_hq.mp3' },
  samplerate: 44100,
  channels: 2,
};

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    arrayBuffer: async () => new TextEncoder().encode('mp3-bytes').buffer,
  };
}

/** A fake clock: sleeping advances `time` and records every wait. */
function fakeClock() {
  const state = { time: 0, waits: [] };
  return {
    state,
    now: () => state.time,
    sleep: async (ms) => {
      state.waits.push(ms);
      state.time += ms;
    },
  };
}

/** Fetch stub that answers from a queue and records each request. */
function scriptedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (next === undefined) throw new Error('unexpected extra request');
    return next;
  };
  return { fetchImpl, calls };
}

const quietLog = () => undefined;

describe('createFreesoundClient', () => {
  it('refuses to start without a key, and the message does not contain a key', () => {
    assert.throws(
      () => createFreesoundClient({ apiKey: undefined }),
      (err) => /FREESOUND_API_KEY is not set/.test(err.message) && !err.message.includes(KEY),
    );
    assert.throws(() => createFreesoundClient({ apiKey: '' }), /FREESOUND_API_KEY is not set/);
  });

  it('sends the key in the Authorization header only, never in the URL', async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse(200, SOUND)]);
    const clock = fakeClock();
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: clock.sleep,
      now: clock.now,
      log: quietLog,
    });
    await client.sound(7);
    assert.equal(calls[0].init.headers.Authorization, `Token ${KEY}`);
    assert.equal(calls[0].url.includes(KEY), false);
    assert.match(calls[0].url, /\/apiv2\/sounds\/7\/\?fields=/);
  });

  it('spaces API requests at least minIntervalMs apart', async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse(200, SOUND),
      jsonResponse(200, SOUND),
      jsonResponse(200, SOUND),
    ]);
    const clock = fakeClock();
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: clock.sleep,
      now: clock.now,
      minIntervalMs: 1100,
      log: quietLog,
    });
    await client.sound(7);
    await client.sound(7);
    await client.sound(7);
    assert.deepEqual(clock.state.waits, [1100, 1100]);
  });

  it('waits for Retry-After on a 429, retries, and then succeeds', async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse(429, {}, { 'retry-after': '7' }),
      jsonResponse(200, SOUND),
    ]);
    const clock = fakeClock();
    const logged = [];
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: clock.sleep,
      now: clock.now,
      minIntervalMs: 0,
      log: (message) => logged.push(message),
    });
    const sound = await client.sound(7);
    assert.equal(sound.id, 7);
    assert.ok(clock.state.waits.includes(7000));
    assert.equal(logged.length, 1);
    assert.match(logged[0], /HTTP 429; retrying in 7 s/);
    assert.equal(logged[0].includes(KEY), false);
  });

  it('gives up after maxRetries and reports the status without the key', async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse(503, {}),
      jsonResponse(503, {}),
      jsonResponse(503, {}),
    ]);
    const clock = fakeClock();
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: clock.sleep,
      now: clock.now,
      minIntervalMs: 0,
      maxRetries: 2,
      log: quietLog,
    });
    await assert.rejects(client.sound(7), (err) => {
      assert.equal(err.message, 'Freesound /sounds/7/ failed with HTTP 503');
      assert.equal(err.message.includes(KEY), false);
      return true;
    });
  });

  it('tells the operator to check the key on 401 and 403, without retrying', async () => {
    for (const status of [401, 403]) {
      const { fetchImpl, calls } = scriptedFetch([jsonResponse(status, {})]);
      const clock = fakeClock();
      const client = createFreesoundClient({
        apiKey: KEY,
        fetchImpl,
        sleep: clock.sleep,
        now: clock.now,
        minIntervalMs: 0,
        log: quietLog,
      });
      await assert.rejects(
        client.sound(7),
        new RegExp(`HTTP ${status} \\(check FREESOUND_API_KEY\\)`),
      );
      assert.equal(calls.length, 1);
    }
  });

  it('rejects a malformed search payload at the boundary', async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse(200, { count: 1, next: null, results: [{ id: 'not-a-number' }] }),
    ]);
    const clock = fakeClock();
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: clock.sleep,
      now: clock.now,
      minIntervalMs: 0,
      log: quietLog,
    });
    await assert.rejects(client.search({ query: 'rain', filter: 'x', pageSize: 5 }));
  });

  it('passes the CC0 filter, the page size and the field list to text search', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      jsonResponse(200, { count: 1, next: null, results: [SOUND] }),
    ]);
    const clock = fakeClock();
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: clock.sleep,
      now: clock.now,
      minIntervalMs: 0,
      log: quietLog,
    });
    const page = await client.search({
      query: 'light rain',
      filter: 'license:"Creative Commons 0"',
      pageSize: 30,
    });
    assert.equal(page.results[0].id, 7);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/apiv2/search/text/');
    assert.equal(url.searchParams.get('query'), 'light rain');
    assert.equal(url.searchParams.get('filter'), 'license:"Creative Commons 0"');
    assert.equal(url.searchParams.get('page_size'), '30');
    assert.match(url.searchParams.get('fields'), /previews/);
  });

  it('downloads the preview bytes with no Authorization header', async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse(200, {})]);
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: async () => undefined,
      now: () => 0,
      log: quietLog,
    });
    const bytes = await client.downloadPreview(SOUND.previews['preview-hq-mp3']);
    assert.equal(Buffer.isBuffer(bytes), true);
    assert.equal(calls[0].init, undefined);
  });

  it('retries a preview download once on a server error', async () => {
    const { fetchImpl } = scriptedFetch([jsonResponse(500, {}), jsonResponse(200, {})]);
    const clock = fakeClock();
    const client = createFreesoundClient({
      apiKey: KEY,
      fetchImpl,
      sleep: clock.sleep,
      now: clock.now,
      log: quietLog,
    });
    const bytes = await client.downloadPreview(SOUND.previews['preview-hq-mp3']);
    assert.ok(bytes.byteLength > 0);
    assert.deepEqual(clock.state.waits, [2000]);
  });
});
