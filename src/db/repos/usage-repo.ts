import { count, gte, sql, sum } from 'drizzle-orm';

import { usageLedger } from '../schema';

import type { UsageEntry } from '../../core/domain';
import type { Db } from '../types';

export type UsageDimension = 'day' | 'model' | 'chapter';

export interface UsageTotal {
  /** UTC day (YYYY-MM-DD), model id, or chapter id. Null for usage that has no chapter. */
  key: string | null;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

/** Day keys are UTC, so they are stable on every device. */
const KEY_EXPRESSIONS = {
  day: sql`strftime('%Y-%m-%d', ${usageLedger.at} / 1000, 'unixepoch')`,
  model: sql`${usageLedger.model}`,
  chapter: sql`${usageLedger.chapterId}`,
} as const;

export const usageRepo = {
  insert(db: Db, entry: UsageEntry): void {
    db.insert(usageLedger).values(entry).run();
  },

  /** Totals grouped by day, model or chapter. `sinceMs` limits the window (inclusive). */
  totalsBy(db: Db, dimension: UsageDimension, options: { sinceMs?: number } = {}): UsageTotal[] {
    const key = KEY_EXPRESSIONS[dimension];
    return db
      .select({
        key: sql<string | null>`${key}`,
        calls: count(),
        promptTokens: sql<number>`coalesce(${sum(usageLedger.promptTokens)}, 0)`,
        completionTokens: sql<number>`coalesce(${sum(usageLedger.completionTokens)}, 0)`,
        costUsd: sql<number>`coalesce(${sum(usageLedger.costUsd)}, 0)`,
      })
      .from(usageLedger)
      .where(options.sinceMs === undefined ? undefined : gte(usageLedger.at, options.sinceMs))
      .groupBy(key)
      .orderBy(key)
      .all();
  },
};
