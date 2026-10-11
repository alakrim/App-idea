import { usageRepo, type UsageTotal } from '@/db/repos/usage-repo';
import type { Db } from '@/db/types';

import { DAY_MS, buildUsageSummary, stageLabel, utcDayStart } from './usage';

import type { UsageCount, UsageSummary } from './usage';

function toCount(row: UsageTotal, label: (key: string | null) => string): UsageCount {
  return { key: row.key ?? '', label: label(row.key), calls: row.calls, costUsd: row.costUsd };
}

/** Reads the three windows and the 30-day breakdowns from the usage ledger. */
export function loadUsageSummary(db: Db, now: number): UsageSummary {
  const today = utcDayStart(now);
  const week = now - 7 * DAY_MS;
  const month = now - 30 * DAY_MS;

  const modelRows = (sinceMs: number): UsageCount[] =>
    usageRepo
      .totalsBy(db, 'model', { sinceMs })
      .map((row) => toCount(row, (key) => key ?? 'Unknown model'));

  const stageRows = usageRepo
    .totalsBy(db, 'stage', { sinceMs: month })
    .map((row) => toCount(row, (key) => stageLabel(key ?? '')));

  return buildUsageSummary({
    today: modelRows(today),
    week: modelRows(week),
    month: modelRows(month),
    byModel: modelRows(month),
    byStage: stageRows,
  });
}
