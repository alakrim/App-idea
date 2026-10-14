CREATE TABLE `chunk_cache` (
	`chapter_id` text NOT NULL,
	`kind` text NOT NULL,
	`input_hash` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`chapter_id`, `kind`, `input_hash`, `model`, `prompt_version`),
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entity_aliases` (
	`entity_id` text NOT NULL,
	`alias` text NOT NULL,
	`first_chapter_order` real NOT NULL,
	PRIMARY KEY(`entity_id`, `alias`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_usage_ledger` (
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
INSERT INTO `__new_usage_ledger`("id", "at", "chapter_id", "stage", "model", "prompt_tokens", "completion_tokens", "audio_seconds", "cost_usd", "generation_id") SELECT "id", "at", "chapter_id", "stage", "model", "prompt_tokens", "completion_tokens", "audio_seconds", "cost_usd", "generation_id" FROM `usage_ledger`;--> statement-breakpoint
DROP TABLE `usage_ledger`;--> statement-breakpoint
ALTER TABLE `__new_usage_ledger` RENAME TO `usage_ledger`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `usage_ledger_chapter_idx` ON `usage_ledger` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `usage_ledger_at_idx` ON `usage_ledger` (`at`);--> statement-breakpoint
CREATE INDEX `usage_ledger_model_idx` ON `usage_ledger` (`model`);--> statement-breakpoint
ALTER TABLE `sentences` ADD `translated_lang` text;--> statement-breakpoint
-- Backfill: a stored translation is in the series' target language (it was written for that target).
UPDATE `sentences` SET `translated_lang` = (
  SELECT `series`.`target_lang` FROM `chapters`
    JOIN `series` ON `series`.`id` = `chapters`.`series_id`
    WHERE `chapters`.`id` = `sentences`.`chapter_id`
) WHERE `translated` IS NOT NULL;--> statement-breakpoint
-- Backfill: each alias moves to its own row. Its reveal chapter is the entity's first chapter, the
-- only order the old JSON array can give. That is the earliest it can have been seen, so an alias
-- can show up early until the series is analysed again. New aliases are stamped when they are learned.
INSERT OR IGNORE INTO `entity_aliases` (`entity_id`, `alias`, `first_chapter_order`)
SELECT `entities`.`id`, `json_each`.`value`, `entities`.`first_chapter_order`
FROM `entities`, json_each(`entities`.`aliases`)
WHERE json_valid(`entities`.`aliases`) AND `json_each`.`type` = 'text' AND trim(`json_each`.`value`) <> '';--> statement-breakpoint
ALTER TABLE `entities` DROP COLUMN `aliases`;