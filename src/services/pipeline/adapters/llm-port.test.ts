import type { ChatRawInput, ChatRawResult, OpenRouterClient } from '@/services/openrouter';

import { createLlmPort } from './llm-port';

function fakeClient(): { client: Pick<OpenRouterClient, 'chatRaw'>; inputs: ChatRawInput[] } {
  const inputs: ChatRawInput[] = [];
  const reply: ChatRawResult = {
    text: '{}',
    usage: { promptTokens: 10, completionTokens: 2, costUsd: 0.001 },
    generationId: null,
    model: 'analysis/model',
  };
  return {
    inputs,
    client: {
      chatRaw: async (input: ChatRawInput) => {
        inputs.push(input);
        return reply;
      },
    },
  };
}

describe('createLlmPort', () => {
  it('forwards temperature and seed to the OpenRouter client', async () => {
    const { client, inputs } = fakeClient();
    const transport = createLlmPort({ openrouter: client }).transportFor('analysis/model');

    await transport({ system: 's', user: 'u', temperature: 0, seed: 1017 });

    expect(inputs[0]).toMatchObject({ model: 'analysis/model', temperature: 0, seed: 1017 });
  });

  it('does not add temperature or seed when the request has none', async () => {
    const { client, inputs } = fakeClient();
    const transport = createLlmPort({ openrouter: client }).transportFor('translation/model');

    await transport({ system: 's', user: 'u' });

    expect(inputs[0]).not.toHaveProperty('temperature');
    expect(inputs[0]).not.toHaveProperty('seed');
  });
});
