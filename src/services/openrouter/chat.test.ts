import { z } from 'zod';

import { parseTolerantJson } from '@/core/llm/json';

import { chatReply, createFakeFetch, jsonResponse } from './__fixtures__/fake-fetch';
import { chatJson, chatText } from './chat';
import { PipelineFailure } from './errors';
import { createModelCatalog } from './models';
import { createTransport } from './transport';

import type { RecordedCall, Route } from './__fixtures__/fake-fetch';
import type { ChatDeps } from './chat';

const memorySchema = z.object({
  summary: z.string(),
  keyEvents: z.array(z.string()).max(10),
});
type Memory = z.infer<typeof memorySchema>;

const validMemory: Memory = { summary: 'The ship docks.', keyEvents: ['Arrival'] };

function makeDeps(route: Route) {
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
  return { deps, calls: fake.calls };
}

function jsonInput(overrides: Partial<Parameters<typeof chatJson<Memory>>[1]> = {}) {
  return {
    model: 'deepseek/deepseek-v4-flash-0731',
    system: 'Summarise the chapter.',
    user: 'Chapter text...',
    schema: memorySchema,
    jsonSchemaName: 'chapter_memory',
    structuredOutput: true,
    ...overrides,
  };
}

function bodyOf(call: RecordedCall | undefined): Record<string, unknown> {
  return call?.body as Record<string, unknown>;
}

describe('chatJson request shape', () => {
  it('sends a strict json_schema response format and requires its parameters', async () => {
    const { deps, calls } = makeDeps(() => chatReply(JSON.stringify(validMemory)));
    await chatJson(deps, jsonInput());

    const body = bodyOf(calls[0]);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'chapter_memory',
        strict: true,
        schema: expect.objectContaining({
          type: 'object',
          required: ['summary', 'keyEvents'],
          additionalProperties: false,
        }),
      },
    });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.usage).toEqual({ include: true });
  });

  it('omits json_schema and adds a JSON-only instruction when the model lacks support', async () => {
    const { deps, calls } = makeDeps(() => chatReply(JSON.stringify(validMemory)));
    await chatJson(deps, jsonInput({ structuredOutput: false }));

    const body = bodyOf(calls[0]);
    expect(body.response_format).toBeUndefined();
    const system = (body.messages as { role: string; content: string }[])[0]?.content;
    expect(system).toContain('Respond with only a single JSON object');
    expect(system).toContain('"keyEvents"');
  });

  it('looks the model up in the catalog when structuredOutput is not given', async () => {
    const { deps, calls } = makeDeps((call) => {
      if (call.url.includes('/models')) {
        return jsonResponse({
          data: [
            {
              id: 'deepseek/deepseek-v4-flash-0731',
              name: 'DeepSeek',
              pricing: { prompt: '0.000000018', completion: '0.00000064' },
              architecture: { input_modalities: ['text'], output_modalities: ['text'] },
              supported_parameters: ['structured_outputs'],
            },
          ],
        });
      }
      return chatReply(JSON.stringify(validMemory));
    });

    await chatJson(deps, jsonInput({ structuredOutput: undefined }));

    expect(calls[0]?.url).toContain('/models?output_modalities=text');
    expect(bodyOf(calls[1]).response_format).toBeDefined();
  });

  it('applies cache_control to the system prompt when asked', async () => {
    const { deps, calls } = makeDeps(() => chatReply(JSON.stringify(validMemory)));
    await chatJson(deps, jsonInput({ cacheControl: { type: 'ephemeral', ttl: '1h' } }));

    const system = (bodyOf(calls[0]).messages as { content: unknown }[])[0]?.content;
    expect(system).toEqual([
      {
        type: 'text',
        text: 'Summarise the chapter.',
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ]);
  });
});

describe('chatJson parsing', () => {
  it('returns validated data with usage, generation id and model', async () => {
    const { deps } = makeDeps(() =>
      chatReply(JSON.stringify(validMemory), { cost: 0.0021, id: 'gen-9' }),
    );
    const result = await chatJson(deps, jsonInput());

    expect(result.data).toEqual(validMemory);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, costUsd: 0.0021 });
    expect(result.generationId).toBe('gen-9');
    expect(result.model).toBe('test/model');
  });

  it('reports costUsd as null when the response carries no cost', async () => {
    const { deps } = makeDeps(() => chatReply(JSON.stringify(validMemory)));
    const result = await chatJson(deps, jsonInput());
    expect(result.usage.costUsd).toBeNull();
  });

  it.each([
    ['a ```json fence', '```json\n{"summary":"The ship docks.","keyEvents":["Arrival"]}\n```'],
    ['a bare fence', '```\n{"summary":"The ship docks.","keyEvents":["Arrival"]}\n```'],
    [
      'leading prose',
      'Here is the memory you asked for: {"summary":"The ship docks.","keyEvents":["Arrival"]}',
    ],
  ])('strips %s before validating', async (_label, reply) => {
    const { deps, calls } = makeDeps(() => chatReply(reply));
    const result = await chatJson(deps, jsonInput());
    expect(result.data).toEqual(validMemory);
    expect(calls).toHaveLength(1);
  });

  it('makes one repair call when the first reply fails validation, and sums the usage', async () => {
    const replies = [
      chatReply(JSON.stringify({ summary: 42, keyEvents: [] }), { cost: 0.001 }),
      chatReply(JSON.stringify(validMemory), { cost: 0.002, id: 'gen-repair' }),
    ];
    const { deps, calls } = makeDeps(() => replies.shift() ?? chatReply('{}'));

    const result = await chatJson(deps, jsonInput());

    expect(result.data).toEqual(validMemory);
    expect(calls).toHaveLength(2);
    expect(result.usage).toEqual({ promptTokens: 20, completionTokens: 10, costUsd: 0.003 });
    expect(result.generationId).toBe('gen-repair');

    const repairMessages = bodyOf(calls[1]).messages as { role: string; content: string }[];
    expect(repairMessages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(repairMessages[3]?.content).toContain('summary:');
  });

  it('repairs a reply that is not JSON at all', async () => {
    const replies = [chatReply('Sorry, I cannot help.'), chatReply(JSON.stringify(validMemory))];
    const { deps, calls } = makeDeps(() => replies.shift() ?? chatReply('{}'));
    const result = await chatJson(deps, jsonInput());
    expect(result.data).toEqual(validMemory);
    expect(calls).toHaveLength(2);
  });

  it('throws LLM_INVALID_OUTPUT after exactly one failed repair', async () => {
    const { deps, calls } = makeDeps(() => chatReply('{"summary": 1}'));

    const error = await chatJson(deps, jsonInput()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PipelineFailure);
    expect((error as PipelineFailure).error.code).toBe('LLM_INVALID_OUTPUT');
    expect(calls).toHaveLength(2);
  });

  it('does not repair when the request itself fails', async () => {
    const { deps, calls } = makeDeps(() =>
      jsonResponse({ error: { message: 'bad key' } }, { status: 401 }),
    );
    const error = await chatJson(deps, jsonInput()).catch((caught: unknown) => caught);
    expect((error as PipelineFailure).error.code).toBe('AUTH');
    expect(calls).toHaveLength(1);
  });
});

describe('chatText', () => {
  it('returns trimmed free text with system and user messages', async () => {
    const { deps, calls } = makeDeps(() => chatReply('  Nine days later.  '));
    const result = await chatText(deps, { model: 'm', system: 'Be brief.', user: 'When?' });

    expect(result.text).toBe('Nine days later.');
    expect(bodyOf(calls[0]).messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'When?' },
    ]);
    expect(bodyOf(calls[0]).response_format).toBeUndefined();
  });
});

describe('parseTolerantJson', () => {
  it('rejects text with no JSON in it', () => {
    expect(parseTolerantJson('no json here').ok).toBe(false);
  });
});
