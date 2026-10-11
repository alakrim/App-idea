import type { Entity, EntityFact } from '@/core/domain';

export interface SuggestionInput {
  /** Every entity of the series. Only those first seen before the cutoff are used. */
  readonly entities: readonly Entity[];
  /** Facts already filtered to before the cutoff order. Used to rank characters and places. */
  readonly facts: readonly EntityFact[];
  readonly cutoffOrder: number;
  /** 1-based display number of the chapter the reader is in. */
  readonly cutoffChapterNumber: number;
}

export const MAX_SUGGESTIONS = 3;

/**
 * Starter questions, built only from names the reader has already met. The most-mentioned
 * character and place are used, then the chapter before the reader's current one. Nothing from the
 * cutoff chapter or later is used, so a suggestion cannot spoil.
 */
export function suggestQuestions(input: SuggestionInput): string[] {
  const { entities, facts, cutoffOrder, cutoffChapterNumber } = input;
  const mentions = new Map<string, number>();
  for (const fact of facts) {
    mentions.set(fact.entityId, (mentions.get(fact.entityId) ?? 0) + 1);
  }
  const visible = entities.filter((entity) => entity.firstChapterOrder < cutoffOrder);
  const topOf = (kind: Entity['kind']): Entity | undefined =>
    visible
      .filter((entity) => entity.kind === kind)
      .sort(
        (a, b) =>
          (mentions.get(b.id) ?? 0) - (mentions.get(a.id) ?? 0) ||
          a.canonicalName.localeCompare(b.canonicalName),
      )[0];

  const questions: string[] = [];
  const character = topOf('character');
  if (character) questions.push(`Who is ${character.canonicalName}?`);
  if (cutoffChapterNumber > 1) {
    questions.push(`What happened in chapter ${cutoffChapterNumber - 1}?`);
  }
  const place = topOf('place');
  if (place) questions.push(`Where is ${place.canonicalName}?`);

  if (questions.length === 0) questions.push('What has happened so far?');
  return questions.slice(0, MAX_SUGGESTIONS);
}
