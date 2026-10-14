import migration0000 from './migrations/0000_swift_omega_sentinel.sql';
import migration0001 from './migrations/0001_fts5_sentences.sql';
import migration0002 from './migrations/0002_curly_redwing.sql';
import migration0003 from './migrations/0003_foamy_nuke.sql';
import migration0004 from './migrations/0004_uneven_zuras.sql';
import migration0005 from './migrations/0005_integrity_fixes.sql';
import journal from './migrations/meta/_journal.json';

/**
 * Migrations compiled into the app. Keys follow drizzle's expo migrator: `m` plus the
 * zero-padded journal index. After `npm run db:generate`, add the new file here.
 */
export const bundledMigrations = {
  journal,
  migrations: {
    m0000: migration0000,
    m0001: migration0001,
    m0002: migration0002,
    m0003: migration0003,
    m0004: migration0004,
    m0005: migration0005,
  },
};
