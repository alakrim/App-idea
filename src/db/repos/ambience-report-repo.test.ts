import { ambienceReportRepo } from './ambience-report-repo';
import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';
import { DbValidationError } from '../json-column';

import type { CueReport } from '../../core/analysis/cue-report';

function report(overrides: Partial<CueReport> = {}): CueReport {
  return {
    model: 'analysis/model',
    promptVersion: 'analysis-v3',
    createdAt: 1_000,
    accepted: 2,
    droppedByReason: {
      malformed: 0,
      unknown_category: 0,
      category_not_enabled: 0,
      low_confidence: 1,
      invalid_span: 0,
      too_short: 3,
      merged: 0,
      overlap_limit: 0,
      density_cap: 0,
    },
    coveragePct: 55,
    fallbackRan: false,
    fromCache: false,
    ...overrides,
  };
}

function setup() {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  chapterRepo.insert(testDb.db, chapterRow(2, 1, 2));
  return testDb;
}

describe('ambienceReportRepo', () => {
  it('returns null when a chapter has no report yet', () => {
    const { db } = setup();
    expect(ambienceReportRepo.get(db, id(1))).toBeNull();
    expect(ambienceReportRepo.latest(db)).toBeNull();
  });

  it('round-trips a report for a chapter', () => {
    const { db } = setup();
    ambienceReportRepo.upsert(db, id(1), report());
    expect(ambienceReportRepo.get(db, id(1))).toEqual(report());
  });

  it('replaces the previous report of the same chapter', () => {
    const { db } = setup();
    ambienceReportRepo.upsert(db, id(1), report());
    ambienceReportRepo.upsert(db, id(1), report({ accepted: 0, createdAt: 2_000 }));
    expect(ambienceReportRepo.get(db, id(1))).toMatchObject({ accepted: 0, createdAt: 2_000 });
  });

  it('reports the most recently written analysis across chapters', () => {
    const { db } = setup();
    ambienceReportRepo.upsert(db, id(1), report({ createdAt: 5_000 }));
    ambienceReportRepo.upsert(db, id(2), report({ createdAt: 9_000, accepted: 1 }));
    expect(ambienceReportRepo.latest(db)).toEqual({
      chapterId: id(2),
      report: report({ createdAt: 9_000, accepted: 1 }),
    });
  });

  it('refuses a report that does not validate', () => {
    const { db } = setup();
    const bad = { ...report(), accepted: -1 };
    expect(() => ambienceReportRepo.upsert(db, id(1), bad)).toThrow();
    expect(ambienceReportRepo.get(db, id(1))).toBeNull();
  });

  it('rejects a stored report that does not match the schema', () => {
    const { db, sqlite } = setup();
    sqlite
      .prepare(`INSERT INTO ambience_reports (chapter_id, report, updated_at) VALUES (?, ?, 0)`)
      .run(id(1), '{"accepted":"many"}');
    expect(() => ambienceReportRepo.get(db, id(1))).toThrow(DbValidationError);
  });

  it('removes the report with its chapter', () => {
    const { db } = setup();
    ambienceReportRepo.upsert(db, id(1), report());
    chapterRepo.delete(db, id(1));
    expect(ambienceReportRepo.get(db, id(1))).toBeNull();
  });
});
