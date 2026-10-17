/*
 * QA-F proof (P1, ledger). A reply that carries no provider cost, for a model the catalog does not
 * list, is recorded as $0. The spend then reads as free in usage. Expected after the fix: the cost
 * is stored as unknown (null) and shown as "unknown". This test fails until the ledger has that state.
 */
import { CostMeter } from './meter';

import type { UsageEntry } from '../domain';
import type { MeterDeps } from './meter';

describe('QA-F audit: an unknown cost is not $0', () => {
  it('records an unknown cost as unknown, not as zero', async () => {
    const entries: UsageEntry[] = [];
    const ports = {
      ledger: {
        record: async (entry: UsageEntry) => {
          entries.push(entry);
        },
      },
      catalog: { find: async () => null },
      clock: { now: () => 1 },
      ids: () => 'usage-1',
      // Partial fake: the meter reads only these four ports. The cast is the test's own choice.
    } as unknown as MeterDeps['ports'];
    const meter = new CostMeter({
      ports,
      chapterId: 'chapter-1',
      stage: 'analyze',
      onSpend: () => undefined,
    });

    await meter.recordChat('vendor/unlisted-model', {
      promptTokens: 10,
      completionTokens: 5,
      costUsd: null,
    });

    expect(entries[0]?.costUsd).toBeNull();
  });
});
