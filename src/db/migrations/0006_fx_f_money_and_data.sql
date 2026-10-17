-- FX-F (never pay twice, never lose data). Every statement is idempotent: a re-run after a partial
-- migrate creates nothing twice and loses no ledger row. `usage_ledger` is rebuilt so that cost_usd
-- can be NULL (an unknown cost); SQLite cannot drop a NOT NULL constraint in place.
CREATE TABLE IF NOT EXISTS `analysis_chunk_checkpoints` (
	`chapter_id` text NOT NULL,
	`chunk_key` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`chapter_id`, `chunk_key`),
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chapter_translations` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`target_lang` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `entity_aliases` (
	`entity_id` text NOT NULL,
	`alias` text NOT NULL,
	`first_chapter_order` real NOT NULL,
	PRIMARY KEY(`entity_id`, `alias`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Legacy aliases carry no reveal chapter. They are stamped with the series' latest chapter order, so a
-- cutoff never shows them early (conservative). Only a chapter added later sees them.
INSERT OR IGNORE INTO `entity_aliases` (`entity_id`, `alias`, `first_chapter_order`)
SELECT
  e.`id`,
  a.`value`,
  COALESCE(
    (SELECT MAX(c.`order`) FROM `chapters` c WHERE c.`series_id` = e.`series_id`),
    e.`first_chapter_order`
  )
FROM `entities` e, json_each(e.`aliases`) a
WHERE a.`type` = 'text';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_usage_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`chapter_id` text,
	`stage` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`audio_seconds` real,
	`cost_usd` real,
	`generation_id` text,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT OR IGNORE INTO `__new_usage_ledger` (`id`, `at`, `chapter_id`, `stage`, `model`, `prompt_tokens`, `completion_tokens`, `audio_seconds`, `cost_usd`, `generation_id`)
SELECT `id`, `at`, `chapter_id`, `stage`, `model`, `prompt_tokens`, `completion_tokens`, `audio_seconds`, `cost_usd`, `generation_id` FROM `usage_ledger`;
--> statement-breakpoint
DROP TABLE IF EXISTS `usage_ledger`;
--> statement-breakpoint
ALTER TABLE `__new_usage_ledger` RENAME TO `usage_ledger`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_ledger_chapter_idx` ON `usage_ledger` (`chapter_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_ledger_at_idx` ON `usage_ledger` (`at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_ledger_model_idx` ON `usage_ledger` (`model`);
