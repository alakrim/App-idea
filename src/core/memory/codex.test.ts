import { buildPriorContext, estimateTokens } from './codex';
import { alias, emptyMemory, entity, fact, fakeId } from '../analysis/__fixtures__/builders';

import type { ChapterMemoryRecord, Entity, EntityFact } from '../analysis/types';

function record(
  chapterOrder: number,
  summary: string,
  keyEvents: string[] = [],
): ChapterMemoryRecord {
  return {
    chapterOrder,
    chapterNumber: chapterOrder,
    memory: emptyMemory({ chapterId: fakeId(chapterOrder), summary, keyEvents }),
  };
}

const memories: ChapterMemoryRecord[] = [
  record(1, 'Ana arrives in port.', ['Ana lands']),
  record(2, 'Ana meets Bo at the inn.', ['Bo is introduced']),
  record(3, 'SPOILER_CH3: the twist is revealed.', ['SPOILER_CH3 event']),
  record(4, 'SPOILER_CH4: the ending.'),
];

const ents: Entity[] = [
  entity({ id: fakeId(101), canonicalName: 'Ana', firstChapterOrder: 1 }),
  entity({ id: fakeId(102), canonicalName: 'Bo', firstChapterOrder: 2 }),
  entity({ id: fakeId(103), canonicalName: 'SPOILER_NEW', firstChapterOrder: 3 }),
];

const facts: EntityFact[] = [
  fact({ id: fakeId(201), entityId: fakeId(101), fact: 'is a pilot', chapterOrder: 1 }),
  fact({ id: fakeId(202), entityId: fakeId(102), fact: 'owns the inn', chapterOrder: 2 }),
  fact({ id: fakeId(203), entityId: fakeId(101), fact: 'SPOILER_FACT secret', chapterOrder: 3 }),
  fact({
    id: fakeId(204),
    entityId: fakeId(103),
    fact: 'SPOILER_NEW is the villain',
    chapterOrder: 3,
  }),
];

describe('estimateTokens', () => {
  it('counts four Latin characters per token and one per CJK character', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('李明')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('buildPriorContext', () => {
  // The QA repro: Jon is introduced in chapter 1, and chapter 9 reveals that he is "The Prince".
  it('never names an alias revealed after the cutoff (QA-A P1-1)', () => {
    const jon = entity({
      id: fakeId(201),
      canonicalName: 'Jon',
      aliases: [alias('Jon Snow', 1), alias('The Prince', 9)],
      firstChapterOrder: 1,
    });
    const jonFacts = [
      fact({ id: fakeId(301), entityId: fakeId(201), fact: 'Lives in the north', chapterOrder: 1 }),
      fact({
        id: fakeId(302),
        entityId: fakeId(201),
        fact: 'Is secretly the Prince',
        chapterOrder: 9,
      }),
    ];

    const codex = buildPriorContext([jon], jonFacts, [], 3, 2000);

    expect(codex).toContain('- Jon (also: Jon Snow): Lives in the north');
    expect(codex).not.toContain('The Prince');
    expect(codex).not.toContain('secretly the Prince');
  });

  it('names the alias once its reveal chapter is before the cutoff', () => {
    const jon = entity({
      id: fakeId(201),
      canonicalName: 'Jon',
      aliases: [alias('The Prince', 9)],
      firstChapterOrder: 1,
    });

    expect(buildPriorContext([jon], [], [], 10, 2000)).toContain('(also: The Prince)');
    expect(buildPriorContext([jon], [], [], 9, 2000)).not.toContain('The Prince');
  });

  it('includes only what is strictly before the cutoff', () => {
    const text = buildPriorContext(ents, facts, memories, 3, 10_000);
    expect(text).toContain('Ana arrives in port.');
    expect(text).toContain('Ana meets Bo at the inn.');
    expect(text).toContain('is a pilot');
    expect(text).toContain('owns the inn');
    expect(text).not.toContain('SPOILER');
    expect(text).toContain('Bo is introduced');
  });

  it('never includes content at or after the cutoff, even when the cutoff equals a chapter order', () => {
    const text = buildPriorContext(ents, facts, memories, 2, 10_000);
    expect(text).not.toContain('Ana meets Bo');
    expect(text).not.toContain('owns the inn');
    expect(text).toContain('Ana arrives in port.');
  });

  it('cites chapter numbers for facts and chapters', () => {
    const text = buildPriorContext(ents, facts, memories, 3, 10_000);
    expect(text).toContain('- Ch. 1: Ana arrives in port.');
    expect(text).toContain('is a pilot (Ch. 1)');
    expect(text).toContain('owns the inn (Ch. 2)');
  });

  it('puts the sections in a fixed order with headings', () => {
    const text = buildPriorContext(ents, facts, memories, 3, 10_000);
    expect(text.indexOf('## Chapters so far')).toBeLessThan(text.indexOf('## Characters'));
    expect(text).toContain('## Characters\n');
  });

  it('keeps the result within the token budget', () => {
    for (const budget of [20, 60, 120, 400]) {
      const text = buildPriorContext(ents, facts, memories, 3, budget);
      expect(estimateTokens(text)).toBeLessThanOrEqual(budget);
    }
  });

  it('returns nothing for a zero budget or when nothing precedes the cutoff', () => {
    expect(buildPriorContext(ents, facts, memories, 3, 0)).toBe('');
    expect(buildPriorContext(ents, facts, memories, 1, 10_000)).toBe('');
  });

  it('prefers recent reveals when the budget is tight', () => {
    const text = buildPriorContext(ents, facts, memories, 3, 40);
    expect(text).toContain('Ch. 2');
    expect(text).not.toContain('Ch. 1');
  });

  it('is deterministic for the same input', () => {
    expect(buildPriorContext(ents, facts, memories, 3, 200)).toBe(
      buildPriorContext(ents, facts, memories, 3, 200),
    );
  });
});
