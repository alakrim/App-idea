import { breakdown, buildUsageSummary, DAY_MS, sumCounts, utcDayStart } from './usage';

describe('usage aggregation', () => {
  it('sums calls and cost, and gives zeros for no rows', () => {
    expect(
      sumCounts([
        { calls: 2, costUsd: 0.25 },
        { calls: 1, costUsd: 0.5 },
      ]),
    ).toEqual({ calls: 3, costUsd: 0.75 });
    expect(sumCounts([])).toEqual({ calls: 0, costUsd: 0 });
  });

  it('orders the breakdown by cost and gives each row its share of the total', () => {
    const rows = breakdown([
      { key: 'a', label: 'Small', calls: 1, costUsd: 0.25, unknownCalls: 0 },
      { key: 'b', label: 'Big', calls: 3, costUsd: 0.75, unknownCalls: 0 },
    ]);
    expect(rows.map((row) => row.key)).toEqual(['b', 'a']);
    expect(rows[0]?.share).toBeCloseTo(0.75, 9);
    expect(rows[1]?.share).toBeCloseTo(0.25, 9);
  });

  it('gives zero shares when nothing was spent', () => {
    const rows = breakdown([{ key: 'a', label: 'Free', calls: 1, costUsd: 0, unknownCalls: 0 }]);
    expect(rows[0]?.share).toBe(0);
  });

  it('builds the three windows and the breakdowns', () => {
    const summary = buildUsageSummary({
      today: [{ key: 'm', label: 'M', calls: 1, costUsd: 0.1, unknownCalls: 0 }],
      week: [{ key: 'm', label: 'M', calls: 2, costUsd: 0.3, unknownCalls: 0 }],
      month: [{ key: 'm', label: 'M', calls: 4, costUsd: 0.6, unknownCalls: 0 }],
      byModel: [{ key: 'm', label: 'M', calls: 4, costUsd: 0.6, unknownCalls: 0 }],
      byStage: [{ key: 'narrate', label: 'Narrate', calls: 4, costUsd: 0.6, unknownCalls: 0 }],
    });
    expect(summary.windows.map((window) => [window.id, window.calls, window.costUsd])).toEqual([
      ['today', 1, 0.1],
      ['week', 2, 0.3],
      ['month', 4, 0.6],
    ]);
    expect(summary.byStage[0]?.label).toBe('Narrate');
  });

  it('starts the day at UTC midnight, the way the ledger groups days', () => {
    const now = Date.UTC(2026, 9, 11, 14, 30);
    expect(utcDayStart(now)).toBe(Date.UTC(2026, 9, 11));
    expect(utcDayStart(now) + DAY_MS).toBeGreaterThan(now);
  });
});
