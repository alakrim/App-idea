import { chatReply, createFakeFetch, jsonResponse } from './__fixtures__/fake-fetch';
import { chatRaw } from './chat';
import { createModelCatalog } from './models';
import { createTransport } from './transport';

import type { RecordedCall, Route } from './__fixtures__/fake-fetch';
import type { ChatDeps } from './chat';

const STRUCTURED = 'vendor/structured';
const PLAIN = 'vendor/plain';
const SCHEMA = { type: 'object', properties: { keep: { type: 'array' } } };

function catalogReply(): Response {
  const model = (id: string, supported: string[]) => ({
    id,
    name: id,
    pricing: { prompt: '0.000001', completion: '0.000002' },
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: supported,
  });
  return jsonResponse({
    data: [model(STRUCTURED, ['structured_outputs']), model(PLAIN, ['temperature'])],
  });
}

function makeDeps(reply: (call: RecordedCall) => Response) {
  const route: Route = (call) => (call.url.includes('/models') ? catalogReply() : reply(call));
  const fake = createFakeFetch(route);
  const transport = createTransport({
    getApiKey: async () => 'sk-or-v1-TESTKEY',
    fetchImpl: fake.fetchImpl,
    baseUrl: 'https://openrouter.ai/api/v1',
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    timeoutMs: 1000,
    maxRetries: 0,
    sleep: async () => undefined,
    random: () => 0.5,
    now: () => 0,
  });
  const models = createModelCatalog({ transport, ttlMs: 60_000, now: () => 0 });
  const deps: ChatDeps = { transport, models };
  const completions = () => fake.calls.filter((call) => call.url.endsWith('/chat/completions'));
  return { deps, completions };
}

function bodyOf(call: RecordedCall | undefined): Record<string, unknown> {
  return call?.body as Record<string, unknown>;
}

describe('chatRaw', () => {
  it('sends a strict json_schema and requires its parameters when the model supports them', async () => {
    const { deps, completions } = makeDeps(() => chatReply('{"keep":[0]}'));
    await chatRaw(deps, {
      model: STRUCTURED,
      system: 'Pick blocks.',
      user: 'Blocks...',
      jsonSchema: { name: 'index_selection', schema: SCHEMA },
    });
    const body = bodyOf(completions()[0]);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'index_selection', strict: true, schema: SCHEMA },
    });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.messages).toEqual([
      { role: 'system', content: 'Pick blocks.' },
      { role: 'user', content: 'Blocks...' },
    ]);
  });

  it('falls back to a JSON-only instruction when the model has no structured output', async () => {
    const { deps, completions } = makeDeps(() => chatReply('{"keep":[0]}'));
    await chatRaw(deps, {
      model: PLAIN,
      system: 'Pick blocks.',
      user: 'Blocks...',
      jsonSchema: { name: 'index_selection', schema: SCHEMA },
    });
    const body = bodyOf(completions()[0]);
    expect(body.response_format).toBeUndefined();
    expect(body.provider).toBeUndefined();
    const system = (body.messages as { content: string }[])[0]?.content ?? '';
    expect(system.startsWith('Pick blocks.')).toBe(true);
    expect(system).toContain('Respond with only a single JSON object');
  });

  it('returns the reply text unvalidated, with its usage and cost', async () => {
    const { deps } = makeDeps(() => chatReply('Not JSON at all.', { cost: 0.0042 }));
    const result = await chatRaw(deps, {
      model: STRUCTURED,
      system: 's',
      user: 'u',
      jsonSchema: { name: 'index_selection', schema: SCHEMA },
    });
    expect(result.text).toBe('Not JSON at all.');
    expect(result.usage.costUsd).toBe(0.0042);
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.model).toBe('test/model');
  });

  it('omits the response format when no schema is given, and sends the body untouched', async () => {
    const { deps, completions } = makeDeps(() => chatReply('  plain text  '));
    const result = await chatRaw(deps, { model: PLAIN, system: '', user: 'hi' });
    const body = bodyOf(completions()[0]);
    expect(body.response_format).toBeUndefined();
    expect(body.messages).toEqual([
      { role: 'system', content: '' },
      { role: 'user', content: 'hi' },
    ]);
    expect(result.text).toBe('  plain text  ');
  });

  it('rejects with CANCELLED when the signal is aborted before the reply', async () => {
    const { deps } = makeDeps(() => chatReply('{}'));
    const controller = new AbortController();
    controller.abort();
    await expect(
      chatRaw(deps, { model: PLAIN, system: 's', user: 'u', signal: controller.signal }),
    ).rejects.toMatchObject({ error: { code: 'CANCELLED' } });
  });

  describe('prompt caching (cacheSystem)', () => {
    const CACHE_BLOCK = {
      type: 'text',
      text: 'Pick blocks.',
      cache_control: { type: 'ephemeral' },
    };

    it.each([['anthropic/claude-haiku-5.5'], ['google/gemini-3.8-flash'], ['qwen/qwen-3-coder']])(
      'puts an explicit cache_control breakpoint on the system block for %s',
      async (model) => {
        const { deps, completions } = makeDeps(() => chatReply('{}'));
        await chatRaw(deps, {
          model,
          system: 'Pick blocks.',
          user: 'Blocks...',
          cacheSystem: true,
        });
        const body = bodyOf(completions()[0]);
        expect(body.messages).toEqual([
          { role: 'system', content: [CACHE_BLOCK] },
          { role: 'user', content: 'Blocks...' },
        ]);
      },
    );

    it('sends a plain system string for providers that cache automatically', async () => {
      const { deps, completions } = makeDeps(() => chatReply('{}'));
      await chatRaw(deps, { model: PLAIN, system: 'Pick blocks.', user: 'u', cacheSystem: true });
      expect(bodyOf(completions()[0]).messages).toEqual([
        { role: 'system', content: 'Pick blocks.' },
        { role: 'user', content: 'u' },
      ]);
    });

    it('sends a plain system string when caching is not asked for', async () => {
      const { deps, completions } = makeDeps(() => chatReply('{}'));
      await chatRaw(deps, { model: 'anthropic/claude-haiku-5.5', system: 'S', user: 'u' });
      expect(bodyOf(completions()[0]).messages).toEqual([
        { role: 'system', content: 'S' },
        { role: 'user', content: 'u' },
      ]);
    });

    it('keeps the cache block on the system prompt when the reply needs a JSON-only instruction', async () => {
      const { deps, completions } = makeDeps(() => chatReply('{"keep":[0]}'));
      await chatRaw(deps, {
        model: 'anthropic/claude-haiku-5.5',
        system: 'Pick blocks.',
        user: 'u',
        jsonSchema: { name: 'index_selection', schema: SCHEMA },
        cacheSystem: true,
      });
      const body = bodyOf(completions()[0]);
      expect(body.response_format).toBeUndefined();
      const [system] = body.messages as { content: { text: string }[] }[];
      expect(system?.content[0]?.text).toContain('Respond with only a single JSON object');
    });
  });
});
