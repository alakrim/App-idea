import type { ChapterMemory, Entity, EntityFact } from '@/core/domain';

import type { SentenceInput } from '../types';

export const SERIES_ID = '01J0000000000000000000SERI';
export const CHAPTER_ID = '01J0000000000000000000CHAP';

/** Valid-looking ULIDs for tests. Only the shape matters, nothing is persisted. */
export function fakeId(n: number): string {
  return `01J00000000000000000000${String(n).padStart(3, '0')}`.slice(0, 26);
}

/** `count` sentences of roughly `length` characters. The text starts with its index for readability. */
export function sentences(count: number, length = 80, startIdx = 0): SentenceInput[] {
  return Array.from({ length: count }, (_, i) => {
    const idx = startIdx + i;
    const head = `S${idx} `;
    return { idx, text: head + 'x'.repeat(Math.max(0, length - head.length)) };
  });
}

export function emptyMemory(overrides: Partial<ChapterMemory> = {}): ChapterMemory {
  return {
    chapterId: CHAPTER_ID,
    promptVersion: 'analysis-v1',
    model: 'test/model',
    summary: '',
    keyEvents: [],
    characters: [],
    places: [],
    items: [],
    relationships: [],
    openThreads: [],
    glossary: [],
    ...overrides,
  };
}

export function entity(overrides: Partial<Entity> & Pick<Entity, 'id' | 'canonicalName'>): Entity {
  return {
    seriesId: SERIES_ID,
    kind: 'character',
    aliases: [],
    firstChapterOrder: 1,
    ...overrides,
  };
}

export function fact(
  overrides: Partial<EntityFact> & Pick<EntityFact, 'id' | 'entityId' | 'fact'>,
): EntityFact {
  return {
    chapterId: CHAPTER_ID,
    chapterOrder: 1,
    ...overrides,
  };
}
