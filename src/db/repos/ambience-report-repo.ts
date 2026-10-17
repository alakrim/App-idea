import { desc, eq } from 'drizzle-orm';

import { CueReportSchema } from '../../core/analysis/cue-report';
import { parseJsonColumn } from '../json-column';
import { ambienceReports } from '../schema';

import type { CueReport } from '../../core/analysis/cue-report';
import type { Db } from '../types';

export interface LatestCueReport {
  readonly chapterId: string;
  readonly report: CueReport;
}

export const ambienceReportRepo = {
  /** Stores the chapter's report, replacing the previous one. The report is validated first. */
  upsert(db: Db, chapterId: string, report: CueReport): void {
    const valid = CueReportSchema.parse(report);
    const json = JSON.stringify(valid);
    db.insert(ambienceReports)
      .values({ chapterId, report: json, updatedAt: valid.createdAt })
      .onConflictDoUpdate({
        target: ambienceReports.chapterId,
        set: { report: json, updatedAt: valid.createdAt },
      })
      .run();
  },

  get(db: Db, chapterId: string): CueReport | null {
    const row = db
      .select()
      .from(ambienceReports)
      .where(eq(ambienceReports.chapterId, chapterId))
      .get();
    if (!row) return null;
    return parseJsonColumn(CueReportSchema, row.report, {
      table: 'ambience_reports',
      column: 'report',
      id: chapterId,
    });
  },

  /** The most recently written report across every chapter, for the Diagnostics card. */
  latest(db: Db): LatestCueReport | null {
    const row = db
      .select()
      .from(ambienceReports)
      .orderBy(desc(ambienceReports.updatedAt))
      .limit(1)
      .get();
    if (!row) return null;
    return {
      chapterId: row.chapterId,
      report: parseJsonColumn(CueReportSchema, row.report, {
        table: 'ambience_reports',
        column: 'report',
        id: row.chapterId,
      }),
    };
  },
};
