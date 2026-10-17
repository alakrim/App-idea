import type { Entity, EntityFact } from '@/core/domain';

import { suggestQuestions } from './suggestions';

const SERIES = '01' + '0'.repeat(24);

function entity(n: number, kind: Entity['kind'], name: string, firstOrder: number): Entity {
  return {
    id: String(n).padStart(26, '0'),
    seriesId: SERIES,
    kind,
    canonicalName: name,
    aliases: [],
    aliasReveals: [],
    firstChapterOrder: firstOrder,
  };
}

function fact(entityN: number, n: number): EntityFact {
  return {
    id: String(900 + n).padStart(26, '0'),
    entityId: String(entityN).padStart(26, '0'),
    chapterId: String(1).padStart(26, '0'),
    chapterOrder: 1,
    fact: `fact ${n}`,
  };
}

describe('suggestQuestions', () => {
  it('asks about the most mentioned character and place, then the previous chapter', () => {
    const entities = [
      entity(1, 'character', 'Lin Mo', 1),
      entity(2, 'character', 'Wen', 1),
      entity(3, 'place', 'Jade Temple', 1),
    ];
    const facts = [fact(2, 1), fact(2, 2), fact(1, 3), fact(3, 4)];

    expect(suggestQuestions({ entities, facts, cutoffOrder: 4, cutoffChapterNumber: 4 })).toEqual([
      'Who is Wen?',
      'What happened in chapter 3?',
      'Where is Jade Temple?',
    ]);
  });

  it('never names an entity first seen at or after the cutoff chapter', () => {
    const entities = [
      entity(1, 'character', 'Lin Mo', 1),
      entity(2, 'character', 'Future Villain', 5),
    ];
    const facts = [fact(2, 1), fact(2, 2), fact(1, 3)];

    const questions = suggestQuestions({
      entities,
      facts,
      cutoffOrder: 5,
      cutoffChapterNumber: 5,
    });

    expect(questions.join(' ')).toContain('Lin Mo');
    expect(questions.join(' ')).not.toContain('Future Villain');
  });

  it('omits the previous-chapter question in chapter 1', () => {
    expect(
      suggestQuestions({ entities: [], facts: [], cutoffOrder: 1, cutoffChapterNumber: 1 }),
    ).toEqual(['What has happened so far?']);
  });

  it('breaks ties by name so the output is stable', () => {
    const entities = [entity(2, 'character', 'Zhou', 1), entity(1, 'character', 'Ali', 1)];

    expect(
      suggestQuestions({ entities, facts: [], cutoffOrder: 2, cutoffChapterNumber: 2 })[0],
    ).toBe('Who is Ali?');
  });
});
