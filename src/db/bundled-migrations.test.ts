import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the app bundle against a forgotten migration. `npm run db:generate` appends an entry to
 * the journal, and the entry must also be imported in bundled-migrations.ts, or the app upgrades
 * its schema without that migration. The bundle imports .sql modules, which Node cannot load, so
 * the test reads both files as text.
 */
const DB_DIR = __dirname;
const MIGRATIONS_DIR = join(DB_DIR, 'migrations');

interface Journal {
  entries: { idx: number; tag: string }[];
}

const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
) as Journal;
const bundle = readFileSync(join(DB_DIR, 'bundled-migrations.ts'), 'utf8');

describe('bundled migrations', () => {
  it('has at least one journal entry to check', () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it.each(journal.entries.map((entry) => [entry.tag, entry] as const))(
    'bundles the migration %s from the journal',
    (tag, entry) => {
      expect(existsSync(join(MIGRATIONS_DIR, `${tag}.sql`))).toBe(true);
      expect(bundle).toContain(`'./migrations/${tag}.sql'`);

      const key = `m${String(entry.idx).padStart(4, '0')}`;
      expect(bundle).toMatch(new RegExp(`\\b${key}\\s*:`));
    },
  );
});
