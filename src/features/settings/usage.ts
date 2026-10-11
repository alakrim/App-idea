/**
 * Usage summaries for the Usage & costs screen. The aggregation is pure so it can be tested on
 * fixed rows. The database reads live in usageRepo; usage-query.ts composes them.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsageCount {
  key: string;
  label: string;
  calls: number;
  costUsd: number;
}

export interface UsageWindow {
  id: 'today' | 'week' | 'month';
  calls: number;
  costUsd: number;
}

export interface UsageShare extends UsageCount {
  /** Fraction of the total cost in [0, 1]. Zero when nothing was spent. */
  share: number;
}

export interface UsageSummary {
  windows: readonly UsageWindow[];
  /** Last 30 days, most expensive first. */
  byModel: readonly UsageShare[];
  /** Last 30 days, most expensive first. */
  byStage: readonly UsageShare[];
}

export const STAGE_LABELS: Readonly<Record<string, string>> = {
  extract: 'Extract',
  clean: 'Clean',
  segment: 'Segment',
  analyze: 'Analyze',
  translate: 'Translate',
  narrate: 'Narrate',
  qa: 'Questions',
  vocab: 'Vocabulary',
  validate: 'Validation',
};

export function stageLabel(key: string): string {
  return STAGE_LABELS[key] ?? key;
}

/** Start of the UTC day that contains `now`. The ledger groups days in UTC. */
export function utcDayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/** Sums rows of calls and cost. Empty input gives zeros. */
export function sumCounts(rows: readonly Pick<UsageCount, 'calls' | 'costUsd'>[]): {
  calls: number;
  costUsd: number;
} {
  return rows.reduce(
    (total, row) => ({
      calls: total.calls + row.calls,
      costUsd: total.costUsd + row.costUsd,
    }),
    { calls: 0, costUsd: 0 },
  );
}

/** Orders rows by cost, highest first, with a stable tie-break on the label, and adds each share. */
export function breakdown(rows: readonly UsageCount[]): UsageShare[] {
  const total = sumCounts(rows).costUsd;
  return [...rows]
    .sort((a, b) => b.costUsd - a.costUsd || a.label.localeCompare(b.label))
    .map((row) => ({ ...row, share: total > 0 ? row.costUsd / total : 0 }));
}

export function buildUsageSummary(input: {
  today: readonly UsageCount[];
  week: readonly UsageCount[];
  month: readonly UsageCount[];
  byModel: readonly UsageCount[];
  byStage: readonly UsageCount[];
}): UsageSummary {
  const windowOf = (id: UsageWindow['id'], rows: readonly UsageCount[]): UsageWindow => ({
    id,
    ...sumCounts(rows),
  });
  return {
    windows: [
      windowOf('today', input.today),
      windowOf('week', input.week),
      windowOf('month', input.month),
    ],
    byModel: breakdown(input.byModel),
    byStage: breakdown(input.byStage),
  };
}
