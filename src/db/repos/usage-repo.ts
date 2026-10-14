import { count, eq, gte, sql, sum } from 'drizzle-orm';

import { usageLedger } from '../schema';

import type { UsageEntry } from '../../core/domain';
import type { Db } from '../types';

export type UsageDimension = 'day' | 'model' | 'chapter' | 'stage';

export interface UsageTotal {
  /** UTC day (YYYY-MM-DD), model id, chapter id or stage. Null for usage that has no chapter. */
  key: string | null;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** The known spend. Calls whose cost is unknown are counted in `unknownCalls`, never as $0. */
  costUsd: number;
  /** Calls whose cost could not be determined. The spend above is a floor when this is above zero. */
  unknownCalls: number;
}

/** Day keys are UTC, so they are stable on every device. */
const KEY_EXPRESSIONS = {
  day: sql`strftime('%Y-%m-%d', ${usageLedger.at} / 1000, 'unixepoch')`,
  model: sql`${usageLedger.model}`,
  chapter: sql`${usageLedger.chapterId}`,
  stage: sql`${usageLedger.stage}`,
} as const;

export const usageRepo = {
  insert(db: Db, entry: UsageEntry): void {
    db.insert(usageLedger).values(entry).run();
  },

  /** A chapter's known spend. It reads only that chapter's rows, through the chapter index. */
  totalCostForChapter(db: Db, chapterId: string): number {
    return (
      db
        .select({ costUsd: sql<number>`coalesce(sum(${usageLedger.costUsd}), 0)` })
        .from(usageLedger)
        .where(eq(usageLedger.chapterId, chapterId))
        .get()?.costUsd ?? 0
    );
  },

  /** Totals grouped by day, model, chapter or stage. `sinceMs` limits the window (inclusive). */
  totalsBy(db: Db, dimension: UsageDimension, options: { sinceMs?: number } = {}): UsageTotal[] {
    const key = KEY_EXPRESSIONS[dimension];
    return db
      .select({
        key: sql<string | null>`${key}`,
        calls: count(),
        promptTokens: sql<number>`coalesce(${sum(usageLedger.promptTokens)}, 0)`,
        completionTokens: sql<number>`coalesce(${sum(usageLedger.completionTokens)}, 0)`,
        costUsd: sql<number>`coalesce(sum(${usageLedger.costUsd}), 0)`,
        unknownCalls: sql<number>`coalesce(sum(case when ${usageLedger.costUsd} is null then 1 else 0 end), 0)`,
      })
      .from(usageLedger)
      .where(options.sinceMs === undefined ? undefined : gte(usageLedger.at, options.sinceMs))
      .groupBy(key)
      .orderBy(key)
      .all();
  },
};
