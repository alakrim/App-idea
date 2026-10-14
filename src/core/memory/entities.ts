import { newId } from '@/core/domain';
import type { ChapterMemory, Entity, EntityFact, EntityKind, IdGenerator } from '@/core/domain';

import { aliasesThrough } from './aliases';

/** A combining mark is only stripped when it follows a Latin letter, so CJK kana are untouched. */
const COMBINING_MARK_AFTER_LATIN = /(?<=\p{Script=Latin})\p{M}+/gu;

/**
 * Canonical form for matching names: NFKC (full-width to ASCII, compatibility forms), diacritics
 * removed from Latin letters, casefolded and whitespace collapsed. CJK text is left as NFKC makes it.
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKC')
    .normalize('NFD')
    .replace(COMBINING_MARK_AFTER_LATIN, '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('ß', 'ss')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Distinct normalized keys for a name and its aliases. Empty strings are dropped. */
export function nameKeys(name: string, aliases: readonly string[] = []): string[] {
  const keys = new Set<string>();
  for (const value of [name, ...aliases]) {
    const key = normalizeName(value);
    if (key) keys.add(key);
  }
  return [...keys];
}

export interface ResolveOptions {
  readonly seriesId: string;
  /** Facts already stored for the series. New facts that repeat one of these are not returned. */
  readonly existingFacts?: readonly EntityFact[];
  /** ID generator for new rows. Defaults to the domain ULID generator. Inject one in tests. */
  readonly newId?: IdGenerator;
}

export interface EntityResolution {
  /** Entities created or changed by this chapter. The caller persists them. */
  readonly upserts: Entity[];
  readonly newFacts: EntityFact[];
}

type MutableEntity = { -readonly [K in keyof Entity]: Entity[K] };

interface Mention {
  readonly kind: EntityKind;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly facts: readonly string[];
}

function mentionsOf(memory: ChapterMemory): Mention[] {
  return [
    ...memory.characters.map((c) => ({ kind: 'character' as const, ...c })),
    ...memory.places.map((p) => ({
      kind: 'place' as const,
      name: p.name,
      aliases: [],
      facts: p.facts,
    })),
    ...memory.items.map((i) => ({
      kind: 'item' as const,
      name: i.name,
      aliases: [],
      facts: i.facts,
    })),
  ];
}

function factKey(entityId: string, fact: string): string {
  return `${entityId}\u0000${normalizeName(fact)}`;
}

/**
 * Matches the memory's characters, places and items against the existing entities of the same
 * kind, by normalized name or alias. Only the aliases revealed through this chapter take part in
 * matching, so a later spelling never links an earlier chapter's mention. Matches gain the new
 * spellings as aliases, stamped with this chapter. Unmatched mentions create entities. Facts are
 * attached with the chapter that revealed them, and duplicates are dropped.
 */
export function resolveEntities(
  existing: readonly Entity[],
  memory: ChapterMemory,
  chapterOrder: number,
  options: ResolveOptions,
): EntityResolution {
  const nextId = options.newId ?? newId;
  const byId = new Map<string, MutableEntity>(
    existing.map((e) => [e.id, { ...e, aliases: [...e.aliases] }]),
  );
  const touched = new Set<string>();
  const seenFacts = new Set<string>(
    (options.existingFacts ?? []).map((f) => factKey(f.entityId, f.fact)),
  );
  const newFacts: EntityFact[] = [];

  for (const mention of mentionsOf(memory)) {
    const keys = nameKeys(mention.name, mention.aliases);
    if (keys.length === 0) continue;

    let entity = [...byId.values()].find(
      (e) =>
        e.kind === mention.kind &&
        nameKeys(e.canonicalName, aliasesThrough(e, chapterOrder)).some((k) => keys.includes(k)),
    );
    if (!entity) {
      entity = {
        id: nextId(),
        seriesId: options.seriesId,
        kind: mention.kind,
        canonicalName: mention.name.trim(),
        aliases: [],
        firstChapterOrder: chapterOrder,
      };
      byId.set(entity.id, entity);
    }

    // Every stored spelling counts as known, so a spelling is stamped once, with the chapter that
    // first revealed it.
    const known = new Set(nameKeys(entity.canonicalName, entity.aliases.map((a) => a.alias)));
    for (const spelling of [mention.name, ...mention.aliases]) {
      const key = normalizeName(spelling);
      if (key && !known.has(key)) {
        entity.aliases.push({ alias: spelling.trim(), firstChapterOrder: chapterOrder });
        known.add(key);
      }
    }
    entity.firstChapterOrder = Math.min(entity.firstChapterOrder, chapterOrder);
    touched.add(entity.id);

    for (const raw of mention.facts) {
      const fact = raw.trim();
      if (!fact) continue;
      const key = factKey(entity.id, fact);
      if (seenFacts.has(key)) continue;
      seenFacts.add(key);
      newFacts.push({
        id: nextId(),
        entityId: entity.id,
        chapterId: memory.chapterId,
        chapterOrder,
        fact,
      });
    }
  }

  return {
    upserts: [...byId.values()].filter((e) => touched.has(e.id)),
    newFacts,
  };
}
