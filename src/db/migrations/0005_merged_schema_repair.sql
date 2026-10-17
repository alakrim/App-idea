-- Merged schema (charming-fermat 0003/0004 plus the ambience tables). Every statement is idempotent:
-- a phone that ran the old ambience-only 0003 has the migrator skip 0003 and 0004, so this file
-- creates their tables. `series.playback_rate` cannot be added idempotently in SQLite and is repaired
-- in code (src/db/repair-schema.ts).
CREATE TABLE IF NOT EXISTS `ambience_cue_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`cues` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ambience_reports` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`report` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ambience_reports_updated_idx` ON `ambience_reports` (`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stage_activity` (
	`chapter_id` text NOT NULL,
	`stage` text NOT NULL,
	`last_activity_at` integer NOT NULL,
	`stall_count` integer DEFAULT 0 NOT NULL,
	`stale_abort_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`chapter_id`, `stage`),
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`sentence_idx` integer NOT NULL,
	`position_ms` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `bookmarks_chapter_sentence_uq` ON `bookmarks` (`chapter_id`,`sentence_idx`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookmarks_series_idx` ON `bookmarks` (`series_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chapter_positions` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`sentence_idx` integer NOT NULL,
	`position_ms` integer NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `chapter_positions` (`chapter_id`, `sentence_idx`, `position_ms`, `completed`, `updated_at`)
SELECT
  lp.current_chapter_id,
  lp.current_sentence_idx,
  COALESCE((
    SELECT
      (SELECT COALESCE(SUM(p.duration_ms), 0) FROM audio_segments p
        WHERE p.chapter_id = g.chapter_id AND p.idx < g.idx)
      + CAST(json_extract(g.sentence_offsets_ms, '$[' || (lp.current_sentence_idx - g.sentence_start) || ']') AS INTEGER)
    FROM audio_segments g
    WHERE g.chapter_id = lp.current_chapter_id
      AND lp.current_sentence_idx BETWEEN g.sentence_start AND g.sentence_end
    LIMIT 1
  ), 0),
  0,
  lp.updated_at
FROM listening_positions lp;
