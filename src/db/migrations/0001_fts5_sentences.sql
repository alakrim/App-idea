-- Word index: unicode61 with diacritics folded (Latin, Cyrillic, Greek, ...).
-- External content: the text lives in `sentences`; this table only stores the index.
CREATE VIRTUAL TABLE `sentences_fts` USING fts5(
	`text`,
	`translated`,
	content=`sentences`,
	content_rowid=`id`,
	tokenize='unicode61 remove_diacritics 2'
);--> statement-breakpoint
-- Substring index for CJK (no spaces, so unicode61 cannot split words). Matches only terms of
-- 3+ characters; shorter CJK terms fall back to a scoped LIKE scan in textRepo.search.
CREATE VIRTUAL TABLE `sentences_fts_trigram` USING fts5(
	`text`,
	`translated`,
	content=`sentences`,
	content_rowid=`id`,
	tokenize='trigram remove_diacritics 1'
);--> statement-breakpoint
CREATE TRIGGER `sentences_fts_ai` AFTER INSERT ON `sentences` BEGIN
	INSERT INTO `sentences_fts` (`rowid`, `text`, `translated`) VALUES (new.`id`, new.`text`, new.`translated`);
	INSERT INTO `sentences_fts_trigram` (`rowid`, `text`, `translated`) VALUES (new.`id`, new.`text`, new.`translated`);
END;--> statement-breakpoint
CREATE TRIGGER `sentences_fts_ad` AFTER DELETE ON `sentences` BEGIN
	INSERT INTO `sentences_fts` (`sentences_fts`, `rowid`, `text`, `translated`) VALUES ('delete', old.`id`, old.`text`, old.`translated`);
	INSERT INTO `sentences_fts_trigram` (`sentences_fts_trigram`, `rowid`, `text`, `translated`) VALUES ('delete', old.`id`, old.`text`, old.`translated`);
END;--> statement-breakpoint
CREATE TRIGGER `sentences_fts_au` AFTER UPDATE ON `sentences` BEGIN
	INSERT INTO `sentences_fts` (`sentences_fts`, `rowid`, `text`, `translated`) VALUES ('delete', old.`id`, old.`text`, old.`translated`);
	INSERT INTO `sentences_fts` (`rowid`, `text`, `translated`) VALUES (new.`id`, new.`text`, new.`translated`);
	INSERT INTO `sentences_fts_trigram` (`sentences_fts_trigram`, `rowid`, `text`, `translated`) VALUES ('delete', old.`id`, old.`text`, old.`translated`);
	INSERT INTO `sentences_fts_trigram` (`rowid`, `text`, `translated`) VALUES (new.`id`, new.`text`, new.`translated`);
END;--> statement-breakpoint
-- Index any rows that already exist (none on a fresh install).
INSERT INTO `sentences_fts` (`sentences_fts`) VALUES ('rebuild');--> statement-breakpoint
INSERT INTO `sentences_fts_trigram` (`sentences_fts_trigram`) VALUES ('rebuild');
