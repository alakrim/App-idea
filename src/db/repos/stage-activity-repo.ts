import { eq, sql } from 'drizzle-orm';

import { stageActivity } from '../schema';

import type { Stage } from '../../core/domain';
import type { Db } from '../types';

export interface StageActivityRow {
  readonly stage: Stage;
  /** Epoch milliseconds of the stage's last event, or of its start when nothing has followed. */
  readonly lastActivityAt: number;
  readonly stallCount: number;
  readonly staleAbortCount: number;
}

type ActivityRow = typeof stageActivity.$inferSelect;

function toRow(row: ActivityRow): StageActivityRow {
  return {
    stage: row.stage,
    lastActivityAt: row.lastActivityAt,
    stallCount: row.stallCount,
    staleAbortCount: row.staleAbortCount,
  };
}

export const stageActivityRepo = {
  /** A stage starts running: its counts start again at zero, and it is active now. */
  startStage(db: Db, chapterId: string, stage: Stage, at: number): void {
    db.insert(stageActivity)
      .values({ chapterId, stage, lastActivityAt: at, stallCount: 0, staleAbortCount: 0 })
      .onConflictDoUpdate({
        target: [stageActivity.chapterId, stageActivity.stage],
        set: { lastActivityAt: at, stallCount: 0, staleAbortCount: 0 },
      })
      .run();
  },

  /** The stage moved (a progress, segment or cost event, or a stage change). */
  touch(db: Db, chapterId: string, stage: Stage, at: number): void {
    db.insert(stageActivity)
      .values({ chapterId, stage, lastActivityAt: at })
      .onConflictDoUpdate({
        target: [stageActivity.chapterId, stageActivity.stage],
        set: { lastActivityAt: at },
      })
      .run();
  },

  /** Counts a stall of the stage. */
  countStall(db: Db, chapterId: string, stage: Stage, at: number): void {
    db.insert(stageActivity)
      .values({ chapterId, stage, lastActivityAt: at, stallCount: 1 })
      .onConflictDoUpdate({
        target: [stageActivity.chapterId, stageActivity.stage],
        set: { lastActivityAt: at, stallCount: sql`${stageActivity.stallCount} + 1` },
      })
      .run();
  },

  /** Counts a request of the stage that was retired as stale. */
  countStaleAbort(db: Db, chapterId: string, stage: Stage, at: number): void {
    db.insert(stageActivity)
      .values({ chapterId, stage, lastActivityAt: at, staleAbortCount: 1 })
      .onConflictDoUpdate({
        target: [stageActivity.chapterId, stageActivity.stage],
        set: {
          lastActivityAt: at,
          staleAbortCount: sql`${stageActivity.staleAbortCount} + 1`,
        },
      })
      .run();
  },

  /** The activity of every stage the chapter has run, in no particular order. */
  listForChapter(db: Db, chapterId: string): StageActivityRow[] {
    return db
      .select()
      .from(stageActivity)
      .where(eq(stageActivity.chapterId, chapterId))
      .all()
      .map(toRow);
  },
};
