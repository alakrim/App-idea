ALTER TABLE `vocab` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `vocab` ADD `known` integer DEFAULT false NOT NULL;