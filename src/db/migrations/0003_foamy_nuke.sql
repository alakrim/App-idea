CREATE TABLE `stage_activity` (
	`chapter_id` text NOT NULL,
	`stage` text NOT NULL,
	`last_activity_at` integer NOT NULL,
	`stall_count` integer DEFAULT 0 NOT NULL,
	`stale_abort_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`chapter_id`, `stage`),
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
