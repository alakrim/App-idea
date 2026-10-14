import type { UsageEntry } from '../domain';
import type { CatalogModel, PipelinePorts } from './ports';
import { CostMeter } from './meter';
import { CATALOG, MODELS } from './__fixtures__/fake-ports';

import type { LlmReply } from '../llm/transport';

const CHAPTER = 'chapter-1';
const PRICED: CatalogModel = {
  id: MODELS.cleanup,
  pricing: { prompt: 0.000001, completion: 0.000002 },
  supportsStyle: false,
};

function harness(catalogFind: (id: string) => Promise<CatalogModel | null> = async (id) => CATALOG[id] ?? null) {
  const rows: UsageEntry[] = [];
  const spends: number[] = [];
  let next = 0;
  const ports = {
    ledger: { record: async (entry: UsageEntry) => void rows.push(entry) },
    catalog: { find: catalogFind },
    clock: { now: () => 1_000 },
    ids: () => `row-${++next}`,
  } as unknown as Pick<PipelinePorts, 'ledger' | 'catalog' | 'clock' | 'ids'>;
  const meter = new CostMeter({
    ports,
    chapterId: CHAPTER,
    stage: 'analyze',
    onSpend: (usd) => spends.push(usd),
  });
  return { meter, rows, spends };
}

const usage = (costUsd: number | null) => ({ promptTokens: 100, completionTokens: 40, costUsd });

describe('CostMeter', () => {
  it('stores the provider-reported cost and the generation id of the call', async () => {
    const { meter, rows } = harness();

    await meter.recordChat(MODELS.cleanup, usage(0.0042), 'gen-abc');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ costUsd: 0.0042, generationId: 'gen-abc', chapterId: CHAPTER });
    expect(meter.spentUsd).toBeCloseTo(0.0042, 12);
  });

  it('prices a call the provider did not price from the catalog', async () => {
    const { meter, rows } = harness(async () => PRICED);

    await meter.recordChat(PRICED.id, usage(null), null);

    expect(rows[0]?.costUsd).toBeCloseTo(100 * 0.000001 + 40 * 0.000002, 12);
  });

  it('stores null, not $0, when the cost is unknown and the catalog cannot price the model', async () => {
    const { meter, rows, spends } = harness(async () => null);

    await meter.recordChat('vendor/removed', usage(null), 'gen-1');

    expect(rows[0]?.costUsd).toBeNull();
    expect(rows[0]?.generationId).toBe('gen-1');
    expect(spends).toEqual([0]);
  });

  it('stores null, not $0, when the catalog lookup fails, and does not fail the stage', async () => {
    const { meter, rows } = harness(async () => {
      throw new Error('catalog offline');
    });

    await meter.recordChat('vendor/x', usage(null), null);

    expect(rows[0]?.costUsd).toBeNull();
  });

  it('prices a later call once the catalog answers again', async () => {
    let online = false;
    const { meter, rows } = harness(async () => {
      if (!online) throw new Error('catalog offline');
      return PRICED;
    });

    await meter.recordChat(PRICED.id, usage(null), null);
    online = true;
    await meter.recordChat(PRICED.id, usage(null), null);

    expect(rows[0]?.costUsd).toBeNull();
    expect(rows[1]?.costUsd).toBeCloseTo(100 * 0.000001 + 40 * 0.000002, 12);
  });

  it('stores null for speech when the provider sent no cost and the catalog does not know the model', async () => {
    const { meter, rows } = harness(async () => null);

    await meter.recordSpeech('vendor/tts', {
      chars: 1200,
      audioSeconds: 30,
      costUsd: null,
      generationId: 'gen-speech',
    });

    expect(rows[0]).toMatchObject({ costUsd: null, generationId: 'gen-speech', audioSeconds: 30 });
  });

  it('prices speech from the catalog when the provider sent no cost', async () => {
    const speech = { id: 'vendor/tts', pricing: { prompt: 0.000001, completion: 0 }, supportsStyle: false };
    const { meter, rows } = harness(async () => speech);

    await meter.recordSpeech(speech.id, { chars: 1000, audioSeconds: 10, costUsd: null, generationId: null });

    expect(rows[0]?.costUsd).toBeCloseTo(1000 * 0.000001, 12);
  });

  it('records every call a transport makes, with the reply generation id', async () => {
    const { meter, rows } = harness();
    const inner = async (): Promise<LlmReply> => ({
      text: '{}',
      usage: usage(0.001),
      generationId: 'gen-wrapped',
    });

    const reply = await meter.transport(MODELS.cleanup, inner)({ system: '', user: '' });

    expect(reply.generationId).toBe('gen-wrapped');
    expect(rows[0]).toMatchObject({ costUsd: 0.001, generationId: 'gen-wrapped' });
  });
});
