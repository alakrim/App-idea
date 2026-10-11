import { normalizeName } from './entities';

import type { ChapterMemoryRecord, Entity, EntityFact, EntityKind } from '../analysis/types';

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/**
 * Rough token count. CJK characters count one token each. Other text counts four characters per
 * token. This is a budget heuristic, not a tokenizer.
 */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

const SECTION_TITLES: Readonly<Record<'chapters' | EntityKind, string>> = {
  chapters: 'Chapters so far',
  character: 'Characters',
  place: 'Places',
  item: 'Items',
  faction: 'Factions',
  term: 'Terms',
};
const SECTION_ORDER: readonly (keyof typeof SECTION_TITLES)[] = [
  'chapters',
  'character',
  'place',
  'item',
  'faction',
  'term',
];

interface Block {
  readonly section: keyof typeof SECTION_TITLES;
  /** Chapter order of the latest reveal. Higher means more recent. */
  readonly recency: number;
  readonly frequency: number;
  readonly anchor: number;
  readonly sortName: string;
  readonly text: string;
}

function chapterBlock(record: ChapterMemoryRecord): Block {
  const { memory } = record;
  const lines = [`- Ch. ${record.chapterNumber}: ${memory.summary}`];
  for (const event of memory.keyEvents) lines.push(`  - ${event}`);
  return {
    section: 'chapters',
    recency: record.chapterOrder,
    frequency: memory.keyEvents.length,
    anchor: record.chapterOrder,
    sortName: '',
    text: lines.join('\n'),
  };
}

function entityBlock(
  entity: Entity,
  facts: readonly EntityFact[],
  cite: (order: number) => string,
): Block {
  const aliases = entity.aliases.length > 0 ? ` (also: ${entity.aliases.join(', ')})` : '';
  const body = facts.map((f) => `${f.fact}${cite(f.chapterOrder)}`).join('; ');
  const latest = facts.reduce((max, f) => Math.max(max, f.chapterOrder), entity.firstChapterOrder);
  return {
    section: entity.kind,
    recency: latest,
    frequency: facts.length,
    anchor: entity.firstChapterOrder,
    sortName: entity.canonicalName,
    text: `- ${entity.canonicalName}${aliases}${body ? `: ${body}` : ''}`,
  };
}

/**
 * A compact text codex of everything known strictly before `cutoffOrder`: chapter summaries, key
 * events and entity facts with the chapter that revealed them. Items are chosen by recency and then
 * by how often they come up, and the result fits `budgetTokens`. Used for analysis `priorContext`
 * and for Q&A. Nothing at or after the cutoff is ever included.
 */
export function buildPriorContext(
  entities: readonly Entity[],
  facts: readonly EntityFact[],
  memories: readonly ChapterMemoryRecord[],
  cutoffOrder: number,
  budgetTokens: number,
): string {
  if (budgetTokens <= 0) return '';

  const numberByOrder = new Map(memories.map((r) => [r.chapterOrder, r.chapterNumber]));
  const cite = (order: number): string => {
    const number = numberByOrder.get(order);
    return number === undefined ? '' : ` (Ch. ${number})`;
  };

  const visibleEntities = entities.filter((e) => e.firstChapterOrder < cutoffOrder);
  const visibleIds = new Set(visibleEntities.map((e) => e.id));
  const factsByEntity = new Map<string, EntityFact[]>();
  const seenFacts = new Set<string>();
  for (const f of [...facts].sort((a, b) => a.chapterOrder - b.chapterOrder)) {
    if (f.chapterOrder >= cutoffOrder || !visibleIds.has(f.entityId)) continue;
    const key = `${f.entityId}\u0000${normalizeName(f.fact)}`;
    if (seenFacts.has(key)) continue;
    seenFacts.add(key);
    const list = factsByEntity.get(f.entityId) ?? [];
    list.push(f);
    factsByEntity.set(f.entityId, list);
  }

  const blocks: Block[] = [
    ...memories.filter((r) => r.chapterOrder < cutoffOrder).map(chapterBlock),
    ...visibleEntities.map((e) => entityBlock(e, factsByEntity.get(e.id) ?? [], cite)),
  ];

  const ranked = [...blocks].sort(
    (a, b) =>
      b.recency - a.recency ||
      b.frequency - a.frequency ||
      a.anchor - b.anchor ||
      a.sortName.localeCompare(b.sortName),
  );

  // Reserve room for the section headings that might be printed.
  const headingCost = SECTION_ORDER.reduce(
    (sum, section) => sum + estimateTokens(`## ${SECTION_TITLES[section]}\n`),
    0,
  );
  let remaining = budgetTokens - headingCost;
  const chosen: Block[] = [];
  for (const block of ranked) {
    const cost = estimateTokens(block.text) + 1;
    if (cost > remaining) continue;
    remaining -= cost;
    chosen.push(block);
  }

  const sections: string[] = [];
  for (const section of SECTION_ORDER) {
    const inSection = chosen
      .filter((b) => b.section === section)
      .sort((a, b) => a.anchor - b.anchor || a.sortName.localeCompare(b.sortName));
    if (inSection.length === 0) continue;
    sections.push(`## ${SECTION_TITLES[section]}\n${inSection.map((b) => b.text).join('\n')}`);
  }
  return sections.join('\n\n');
}
