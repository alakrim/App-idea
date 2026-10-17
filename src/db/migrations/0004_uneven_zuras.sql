CREATE TABLE `bookmarks` (
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
CREATE UNIQUE INDEX `bookmarks_chapter_sentence_uq` ON `bookmarks` (`chapter_id`,`sentence_idx`);--> statement-breakpoint
CREATE INDEX `bookmarks_series_idx` ON `bookmarks` (`series_id`);--> statement-breakpoint
CREATE TABLE `chapter_positions` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`sentence_idx` integer NOT NULL,
	`position_ms` integer NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `series` ADD `playback_rate` real;
--> statement-breakpoint
INSERT INTO `chapter_positions` (`chapter_id`, `sentence_idx`, `position_ms`, `completed`, `updated_at`)
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
