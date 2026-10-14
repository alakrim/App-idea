/*
 * Which spellings of an entity a reader may see. Every alias carries the chapter that revealed it,
 * so the context built for a cutoff never names an alias that the reader has not reached yet.
 */
import type { Entity, EntityAlias } from '../domain';

/** The spellings revealed strictly before `cutoffOrder`. Used for prior context and Q&A. */
export function aliasesBefore(entity: Pick<Entity, 'aliases'>, cutoffOrder: number): string[] {
  return visibleAliases(entity.aliases, (alias) => alias.firstChapterOrder < cutoffOrder);
}

/** The spellings revealed at or before `chapterOrder`. Used for the chapter being resolved. */
export function aliasesThrough(entity: Pick<Entity, 'aliases'>, chapterOrder: number): string[] {
  return visibleAliases(entity.aliases, (alias) => alias.firstChapterOrder <= chapterOrder);
}

function visibleAliases(
  aliases: readonly EntityAlias[],
  isVisible: (alias: EntityAlias) => boolean,
): string[] {
  return aliases.filter(isVisible).map((alias) => alias.alias);
}
