CREATE TABLE `ambience_cue_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`cues` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ambience_reports` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`report` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ambience_reports_updated_idx` ON `ambience_reports` (`updated_at`);