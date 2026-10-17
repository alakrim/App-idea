/** The statements the repair needs from a SQLite client. expo-sqlite and better-sqlite3 both fit it. */
export interface RepairClient {
  columnNames(table: string): string[];
  exec(statement: string): void;
}

/**
 * Adds the columns that the merged migrations cannot add idempotently. A phone that ran the old
 * ambience-only 0003 has the migrator skip charming-fermat's 0004, so `series.playback_rate` can be
 * missing. SQLite has no ADD COLUMN IF NOT EXISTS, so the check happens here. Safe after every migrate.
 */
export function repairSchema(client: RepairClient): void {
  if (!client.columnNames('series').includes('playback_rate')) {
    client.exec('ALTER TABLE `series` ADD `playback_rate` real');
  }
}
