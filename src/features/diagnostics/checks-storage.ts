import { sql } from 'drizzle-orm';

import type { Db } from '@/db/types';

import type { ProbeOutcome } from './probe';

/** Reads the SQLite library version. */
export function checkSqliteVersion(db: Db): ProbeOutcome {
  const row = db.all<{ version: string }>(sql`select sqlite_version() as version`)[0];
  const version = row?.version ?? '';
  return {
    status: version !== '' ? 'pass' : 'fail',
    values: { version },
    message: version !== '' ? undefined : 'sqlite_version() returned nothing.',
  };
}

const FTS_TABLE = 'diagnostics_fts_probe';

/**
 * Creates a temporary FTS5 table with the trigram tokenizer, which search over CJK text needs, and
 * matches a substring in it. The table is dropped again whatever the outcome.
 */
export function checkFts5Trigram(db: Db): ProbeOutcome {
  try {
    db.run(sql.raw(`CREATE VIRTUAL TABLE ${FTS_TABLE} USING fts5(body, tokenize = 'trigram')`));
    try {
      db.run(sql.raw(`INSERT INTO ${FTS_TABLE} (body) VALUES ('ツールの使い方を学ぶ')`));
      const hits = db.all<{ body: string }>(
        sql.raw(`SELECT body FROM ${FTS_TABLE} WHERE ${FTS_TABLE} MATCH '使い方'`),
      );
      const matched = hits.length === 1;
      return {
        status: matched ? 'pass' : 'fail',
        values: { trigram: true, matched: hits.length },
        message: matched ? undefined : 'The trigram table did not match a CJK substring.',
      };
    } finally {
      db.run(sql.raw(`DROP TABLE IF EXISTS ${FTS_TABLE}`));
    }
  } catch (error) {
    return {
      status: 'fail',
      values: { trigram: false },
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The database file's size and the free space on the device, in bytes. */
export interface StorageSizes {
  databaseBytes: number | null;
  freeBytes: number | null;
}

export function checkStorageSizes(sizes: StorageSizes): ProbeOutcome {
  const known = sizes.databaseBytes !== null && sizes.freeBytes !== null;
  return {
    status: known ? 'pass' : 'fail',
    values: { databaseBytes: sizes.databaseBytes, freeBytes: sizes.freeBytes },
    message: known ? undefined : 'The database size or the free space could not be read.',
  };
}
