import { normalizeName, nameKeys } from '../memory/entities';
import { MEMORY_LIMITS } from './limits';
import { truncateWords } from './schemas';
import type { GlossaryEntry, MemoryFields, NamedFacts } from './types';

interface NamedEntry {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly role?: string;
  readonly facts: readonly string[];
}

/**
 * Groups entries that share a normalized name or alias. Transitive matches join the same group,
 * so A~B and B~C give one group. Order follows first appearance.
 */
function clusterByName<T extends NamedEntry>(entries: readonly T[]): T[][] {
  const clusters: { keys: Set<string>; members: T[] }[] = [];
  for (const entry of entries) {
    const keys = nameKeys(entry.name, entry.aliases ?? []);
    const hits = clusters.filter((c) => keys.some((k) => c.keys.has(k)));
    if (hits.length === 0) {
      clusters.push({ keys: new Set(keys), members: [entry] });
      continue;
    }
    const [first, ...rest] = hits;
    if (!first) continue;
    first.members.push(entry);
    keys.forEach((k) => first.keys.add(k));
    for (const other of rest) {
      first.members.push(...other.members);
      other.keys.forEach((k) => first.keys.add(k));
      clusters.splice(clusters.indexOf(other), 1);
    }
  }
  return clusters.map((c) => c.members);
}

/** Unique items by normalized form, keeping the first spelling. */
function uniqueBy(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeName(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function mergeNamedFacts(entries: readonly NamedFacts[], max: number): NamedFacts[] {
  return clusterByName(entries)
    .map((members) => ({
      name: members[0]?.name ?? '',
      facts: uniqueBy(members.flatMap((m) => m.facts)).slice(0, MEMORY_LIMITS.facts),
    }))
    .slice(0, max);
}

function mergeCharacters(
  entries: MemoryFields['characters'],
  max: number,
): MemoryFields['characters'] {
  return clusterByName(entries)
    .map((members) => {
      const name = members[0]?.name ?? '';
      const role = members.find((m) => m.role)?.role;
      const aliases = uniqueBy(members.flatMap((m) => [...m.aliases])).filter(
        (a) => normalizeName(a) !== normalizeName(name),
      );
      return {
        name,
        aliases,
        ...(role ? { role } : {}),
        facts: uniqueBy(members.flatMap((m) => m.facts)).slice(0, MEMORY_LIMITS.facts),
      };
    })
    .slice(0, max);
}

function mergeGlossary(entries: readonly GlossaryEntry[]): GlossaryEntry[] {
  const byTerm = new Map<string, GlossaryEntry>();
  for (const entry of entries) {
    const key = normalizeName(entry.term);
    if (!key) continue;
    const existing = byTerm.get(key);
    if (!existing) {
      byTerm.set(key, entry);
      continue;
    }
    byTerm.set(key, {
      term: existing.term,
      translation: existing.translation ?? entry.translation,
      note: existing.note ?? entry.note,
    });
  }
  return [...byTerm.values()]
    .map((g) => ({
      term: g.term,
      ...(g.translation ? { translation: g.translation } : {}),
      ...(g.note ? { note: g.note } : {}),
    }))
    .slice(0, MEMORY_LIMITS.glossary);
}

const EMPTY_MEMORY: MemoryFields = {
  summary: '',
  keyEvents: [],
  characters: [],
  places: [],
  items: [],
  relationships: [],
  openThreads: [],
  glossary: [],
};

/**
 * Merges the memories of consecutive chunks of one chapter (B7 map-reduce). Characters, places and
 * items are unioned by name. Key events are concatenated in order, then capped. Open threads come
 * from the last chunk. The summary is the chunk summaries joined, capped; the caller may replace
 * it with a reduce call.
 */
export function mergeMemoryDrafts(drafts: readonly MemoryFields[]): MemoryFields {
  if (drafts.length === 0) return EMPTY_MEMORY;
  const last = drafts[drafts.length - 1] ?? EMPTY_MEMORY;

  const keyEvents = uniqueBy(drafts.flatMap((d) => d.keyEvents))
    .slice(0, MEMORY_LIMITS.keyEvents)
    .map((e) => truncateWords(e, MEMORY_LIMITS.keyEventWords));

  const relationshipKeys = new Set<string>();
  const relationships = drafts
    .flatMap((d) => d.relationships)
    .filter((r) => {
      const key = [r.a, r.b, r.nature].map(normalizeName).join('\u0000');
      if (relationshipKeys.has(key)) return false;
      relationshipKeys.add(key);
      return true;
    })
    .slice(0, MEMORY_LIMITS.relationships);

  return {
    summary: truncateWords(
      drafts
        .map((d) => d.summary)
        .filter((s) => s !== '')
        .join(' '),
      MEMORY_LIMITS.summaryWords,
    ),
    keyEvents,
    characters: mergeCharacters(
      drafts.flatMap((d) => d.characters),
      MEMORY_LIMITS.characters,
    ),
    places: mergeNamedFacts(
      drafts.flatMap((d) => d.places),
      MEMORY_LIMITS.places,
    ),
    items: mergeNamedFacts(
      drafts.flatMap((d) => d.items),
      MEMORY_LIMITS.items,
    ),
    relationships,
    openThreads: uniqueBy(last.openThreads).slice(0, MEMORY_LIMITS.openThreads),
    glossary: mergeGlossary(drafts.flatMap((d) => d.glossary)),
  };
}
