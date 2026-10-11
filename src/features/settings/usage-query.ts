import { count, gte, sql, sum } from 'drizzle-orm';

import { usageRepo } from '@/db/repos/usage-repo';
import { usageLedger } from '@/db/schema';
import type { Db } from '@/db/types';

import { DAY_MS, buildUsageSummary, stageLabel, utcDayStart } from './usage';

import type { UsageCount, UsageSummary } from './usage';

/** Reads the three windows and the 30-day breakdowns from the usage ledger. */
export function loadUsageSummary(db: Db, now: number): UsageSummary {
  const today = utcDayStart(now);
  const week = now - 7 * DAY_MS;
  const month = now - 30 * DAY_MS;

  const modelRows = (sinceMs: number): UsageCount[] =>
    usageRepo.totalsBy(db, 'model', { sinceMs }).map((row) => ({
      key: row.key ?? '',
      label: row.key ?? 'Unknown model',
      calls: row.calls,
      costUsd: row.costUsd,
    }));

  const stageRows: UsageCount[] = db
    .select({
      key: usageLedger.stage,
      calls: count(),
      costUsd: sql<number>`coalesce(${sum(usageLedger.costUsd)}, 0)`,
    })
    .from(usageLedger)
    .where(gte(usageLedger.at, month))
    .groupBy(usageLedger.stage)
    .all()
    .map((row) => ({
      key: row.key,
      label: stageLabel(row.key),
      calls: row.calls,
      costUsd: row.costUsd,
    }));

  return buildUsageSummary({
    today: modelRows(today),
    week: modelRows(week),
    month: modelRows(month),
    byModel: modelRows(month),
    byStage: stageRows,
  });
}
