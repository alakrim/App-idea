CREATE TABLE `ambience_cues` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`category` text NOT NULL,
	`start_sentence` integer NOT NULL,
	`end_sentence` integer NOT NULL,
	`intensity` text NOT NULL,
	`fade_in_ms` integer NOT NULL,
	`fade_out_ms` integer NOT NULL,
	`confidence` real NOT NULL,
	`reason` text NOT NULL,
	`enabled` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ambience_cues_chapter_start_idx` ON `ambience_cues` (`chapter_id`,`start_sentence`);--> statement-breakpoint
CREATE TABLE `audio_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`idx` integer NOT NULL,
	`sentence_start` integer NOT NULL,
	`sentence_end` integer NOT NULL,
	`file_uri` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`sentence_offsets_ms` text NOT NULL,
	`profile_id` text NOT NULL,
	`input_hash` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `narration_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_segments_chapter_idx_uq` ON `audio_segments` (`chapter_id`,`idx`);--> statement-breakpoint
CREATE INDEX `audio_segments_profile_idx` ON `audio_segments` (`profile_id`);--> statement-breakpoint
CREATE TABLE `chapter_memory` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`memory` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`order` real NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`source_lang` text,
	`status` text NOT NULL,
	`word_count` integer,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chapters_series_order_idx` ON `chapters` (`series_id`,`order`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`kind` text NOT NULL,
	`canonical_name` text NOT NULL,
	`aliases` text NOT NULL,
	`first_chapter_order` real NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entities_series_name_idx` ON `entities` (`series_id`,`canonical_name`);--> statement-breakpoint
CREATE TABLE `entity_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`chapter_order` real NOT NULL,
	`fact` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entity_facts_entity_idx` ON `entity_facts` (`entity_id`);--> statement-breakpoint
CREATE INDEX `entity_facts_chapter_idx` ON `entity_facts` (`chapter_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`input_hash` text NOT NULL,
	`model` text,
	`prompt_version` text,
	`progress` real DEFAULT 0 NOT NULL,
	`error` text,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_chapter_stage_uq` ON `jobs` (`chapter_id`,`stage`);--> statement-breakpoint
CREATE TABLE `listening_positions` (
	`series_id` text PRIMARY KEY NOT NULL,
	`current_chapter_id` text NOT NULL,
	`current_chapter_order` real NOT NULL,
	`current_sentence_idx` integer NOT NULL,
	`furthest_chapter_id` text NOT NULL,
	`furthest_chapter_order` real NOT NULL,
	`furthest_sentence_idx` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`furthest_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listening_positions_current_chapter_idx` ON `listening_positions` (`current_chapter_id`);--> statement-breakpoint
CREATE INDEX `listening_positions_furthest_chapter_idx` ON `listening_positions` (`furthest_chapter_id`);--> statement-breakpoint
CREATE TABLE `narration_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`voice` text NOT NULL,
	`style` text,
	`speed` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paragraphs` (
	`chapter_id` text NOT NULL,
	`idx` integer NOT NULL,
	`sentence_start` integer NOT NULL,
	`sentence_end` integer NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`chapter_id`, `idx`),
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `qa_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`cutoff_chapter_order` real NOT NULL,
	`cutoff_sentence_idx` integer NOT NULL,
	`citations` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qa_messages_series_created_idx` ON `qa_messages` (`series_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sentences` (
	`id` integer PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`idx` integer NOT NULL,
	`paragraph_idx` integer NOT NULL,
	`text` text NOT NULL,
	`translated` text,
	`char_count` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sentences_chapter_idx_uq` ON `sentences` (`chapter_id`,`idx`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`cover_uri` text,
	`cover_tint` text,
	`source_lang` text,
	`target_lang` text,
	`narration_profile_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`narration_profile_id`) REFERENCES `narration_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `series_narration_profile_id_idx` ON `series` (`narration_profile_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`chapter_id` text,
	`stage` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`audio_seconds` real,
	`cost_usd` real NOT NULL,
	`generation_id` text,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `usage_ledger_chapter_idx` ON `usage_ledger` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `usage_ledger_at_idx` ON `usage_ledger` (`at`);--> statement-breakpoint
CREATE INDEX `usage_ledger_model_idx` ON `usage_ledger` (`model`);--> statement-breakpoint
CREATE TABLE `vocab` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`sentence_idx` integer NOT NULL,
	`term` text NOT NULL,
	`lang` text NOT NULL,
	`explanation` text,
	`translation` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_series_created_idx` ON `vocab` (`series_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `vocab_chapter_idx` ON `vocab` (`chapter_id`);