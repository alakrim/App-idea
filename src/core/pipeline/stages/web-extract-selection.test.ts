import { chunkForSelection, TOO_LARGE_TO_READ } from '../../extract/select';

import { selectBlocks } from './web-extract';
import { StageFailure } from '../errors';

import type { Block } from '../../extract/types';
import type { StageContext } from '../context';
import type { LlmRequest, LlmReply } from '../../llm/transport';

const block = (n: number): Block => ({
  tag: 'p',
  text: `The harbour council met on day ${n} and discussed the storm damage along the quay.`,
});
const blocks = (count: number): Block[] => Array.from({ length: count }, (_, n) => block(n));

/** A stage context with only what selectBlocks reads: the cleanup model, a transport and a signal. */
function contextWith(reply: (request: LlmRequest) => LlmReply) {
  const requests: LlmRequest[] = [];
  const transport = async (request: LlmRequest): Promise<LlmReply> => {
    requests.push(request);
    return reply(request);
  };
  const ctx = {
    record: { settings: { cleanupModel: 'cleanup/model' } },
    meter: { transport: (_model: string, inner: typeof transport) => inner },
    ports: { llm: { transportFor: () => transport } },
    signal: new AbortController().signal,
  } as unknown as StageContext;
  return { ctx, requests };
}

/** Keeps every block the prompt shows, by reading the numbered lines of the prompt. */
function keepAllShown(request: LlmRequest): LlmReply {
  const shown = [...request.user.matchAll(/^\[(\d+)\] /gmu)].length;
  return {
    text: JSON.stringify({ keep: Array.from({ length: shown }, (_, n) => n) }),
    usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    generationId: null,
  };
}

describe('selectBlocks on a long page', () => {
  it('asks in several calls, and keeps every block when each call keeps its own', async () => {
    const page = blocks(400);
    const { ctx, requests } = contextWith(keepAllShown);

    const kept = await selectBlocks(ctx, page, { title: null, lang: 'en' });

    expect(requests.length).toBeGreaterThan(1);
    expect(kept).toEqual(page);
  });

  it("maps each chunk's keep positions back to the page, so the dropped blocks are the ones left out", async () => {
    const page = blocks(400);
    const dropped = chunkForSelection(page).map((chunk) => chunk[chunk.length - 1]?.index ?? -1);
    // Each call keeps all of its blocks but the last, so exactly one block per chunk goes.
    const { ctx } = contextWith((request) => {
      const shown = [...request.user.matchAll(/^\[(\d+)\] /gmu)].length;
      return {
        text: JSON.stringify({ keep: Array.from({ length: shown - 1 }, (_, n) => n) }),
        usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        generationId: null,
      };
    });

    const kept = await selectBlocks(ctx, page, { title: null, lang: 'en' });

    expect(kept).toEqual(page.filter((_, index) => !dropped.includes(index)));
  });

  it('refuses a page that needs more calls than the cap, before any call is made', async () => {
    const { ctx, requests } = contextWith(keepAllShown);

    const error = await selectBlocks(ctx, blocks(4000), { title: null, lang: 'en' }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(StageFailure);
    expect((error as StageFailure).error).toMatchObject({
      code: 'INPUT_TOO_LONG',
      message: TOO_LARGE_TO_READ,
      retryable: false,
    });
    expect(requests).toHaveLength(0);
  });
});
