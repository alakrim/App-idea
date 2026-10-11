import type { Db } from '@/db/types';

import { checkFts5Trigram, checkSqliteVersion, checkStorageSizes } from './checks-storage';

/** A database stand-in that answers each statement from a script, and records what ran. */
function scriptedDb(answers: { all?: unknown[][]; run?: (sql: string) => void }) {
  const statements: string[] = [];
  const queue = [...(answers.all ?? [])];
  const db = {
    all(query: { queryChunks?: unknown[] }) {
      statements.push(JSON.stringify(query));
      return queue.shift() ?? [];
    },
    run(query: unknown) {
      const text = JSON.stringify(query);
      statements.push(text);
      answers.run?.(text);
      return { changes: 0 };
    },
  };
  return { db: db as unknown as Db, statements };
}

describe('SQLite version probe', () => {
  it('reads the library version', () => {
    const { db } = scriptedDb({ all: [[{ version: '3.50.4' }]] });
    expect(checkSqliteVersion(db)).toMatchObject({ status: 'pass', values: { version: '3.50.4' } });
  });

  it('fails when SQLite returns no version', () => {
    const { db } = scriptedDb({ all: [[]] });
    expect(checkSqliteVersion(db)).toMatchObject({ status: 'fail' });
  });
});

describe('FTS5 trigram probe', () => {
  it('creates the trigram table, matches a CJK substring, and drops the table', () => {
    const { db, statements } = scriptedDb({ all: [[{ body: 'ツールの使い方を学ぶ' }]] });

    const outcome = checkFts5Trigram(db);

    expect(outcome).toMatchObject({ status: 'pass', values: { trigram: true, matched: 1 } });
    expect(statements.some((text) => text.includes('trigram'))).toBe(true);
    expect(statements.at(-1)).toContain('DROP TABLE IF EXISTS diagnostics_fts_probe');
  });

  it('reports the failure, and still drops the table, when FTS5 is missing', () => {
    const dropped: string[] = [];
    const { db } = scriptedDb({
      run: (text) => {
        if (text.includes('CREATE VIRTUAL TABLE')) throw new Error('no such module: fts5');
        dropped.push(text);
      },
    });

    const outcome = checkFts5Trigram(db);

    expect(outcome).toMatchObject({
      status: 'fail',
      values: { trigram: false },
      message: 'no such module: fts5',
    });
    expect(dropped).toEqual([]);
  });

  it('fails when the table does not match a substring', () => {
    const { db } = scriptedDb({ all: [[]] });
    expect(checkFts5Trigram(db)).toMatchObject({
      status: 'fail',
      message: 'The trigram table did not match a CJK substring.',
    });
  });
});

describe('storage sizes probe', () => {
  it('passes when the database size and free space are known', () => {
    expect(checkStorageSizes({ databaseBytes: 1024, freeBytes: 2048 })).toMatchObject({
      status: 'pass',
      values: { databaseBytes: 1024, freeBytes: 2048 },
    });
  });

  it('fails and names what could not be read', () => {
    expect(checkStorageSizes({ databaseBytes: null, freeBytes: 2048 })).toMatchObject({
      status: 'fail',
      values: { databaseBytes: null, freeBytes: 2048 },
    });
  });
});
