import { buildGlossary } from './glossary';
import { estimateTokens } from '../text/chunk';

import type { ChapterMemoryRecord } from '../analysis/types';
import type { ChapterMemory, Entity } from '../domain';

function memory(glossary: ChapterMemory['glossary']): ChapterMemory {
  return {
    chapterId: 'ch',
    promptVersion: 'analysis-v1',
    model: 'test',
    summary: '',
    keyEvents: [],
    characters: [],
    places: [],
    items: [],
    relationships: [],
    openThreads: [],
    glossary,
  };
}

function record(chapterOrder: number, glossary: ChapterMemory['glossary']): ChapterMemoryRecord {
  return { chapterOrder, chapterNumber: chapterOrder, memory: memory(glossary) };
}

function entity(canonicalName: string, firstChapterOrder: number, aliases: string[] = []): Entity {
  return {
    id: `e-${canonicalName}`,
    seriesId: 's',
    kind: 'character',
    canonicalName,
    aliases,
    aliasReveals: aliases.map((alias) => ({ alias, firstChapterOrder })),
    firstChapterOrder,
  };
}

const LARGE = { currentChapterOrder: 10, budgetTokens: 10_000 };

describe('buildGlossary: merging', () => {
  it('keeps the first translation chosen by an earlier chapter', () => {
    const glossary = buildGlossary(
      [
        record(1, [{ term: 'Torre', translation: 'Tower' }]),
        record(2, [{ term: 'Torre', translation: 'Keep' }]),
      ],
      [],
      LARGE,
    );
    expect(glossary).toEqual([{ term: 'Torre', translation: 'Tower', note: null }]);
  });

  it('fills a missing translation or note from a later chapter, and never overwrites', () => {
    const glossary = buildGlossary(
      [
        record(1, [{ term: 'Ada' }]),
        record(2, [{ term: 'Ada', translation: 'Ada V.', note: 'surname later' }]),
        record(3, [{ term: 'Ada', translation: 'Someone else', note: 'ignored' }]),
      ],
      [],
      LARGE,
    );
    expect(glossary).toEqual([{ term: 'Ada', translation: 'Ada V.', note: 'surname later' }]);
  });

  it('matches terms by normalised name, ignoring case and accents', () => {
    const glossary = buildGlossary(
      [
        record(1, [{ term: 'Élodie', translation: 'Elodie' }]),
        record(2, [{ term: 'elodie', note: 'friend' }]),
      ],
      [],
      LARGE,
    );
    expect(glossary).toHaveLength(1);
    expect(glossary[0]).toEqual({ term: 'Élodie', translation: 'Elodie', note: 'friend' });
  });

  it('adds entity canonical names that have no glossary entry, with null translation', () => {
    const glossary = buildGlossary(
      [record(1, [{ term: 'Torre', translation: 'Tower' }])],
      [entity('Mara Oss', 1), entity('Vel', 2)],
      LARGE,
    );
    expect(glossary).toEqual([
      { term: 'Mara Oss', translation: null, note: null },
      { term: 'Torre', translation: 'Tower', note: null },
      { term: 'Vel', translation: null, note: null },
    ]);
  });

  it('does not list an entity again when its name or an alias is already a glossary term', () => {
    const glossary = buildGlossary(
      [record(1, [{ term: 'Mara', translation: 'Mara' }])],
      [entity('Mara Oss', 1, ['Mara']), entity('Torvald', 1)],
      LARGE,
    );
    expect(glossary.map((g) => g.term)).toEqual(['Mara', 'Torvald']);
  });

  it('does not list an entity twice when two entities share an alias', () => {
    const glossary = buildGlossary(
      [],
      [entity('Ana Costa', 1, ['Ana']), entity('Ana Lima', 2, ['Ana'])],
      LARGE,
    );
    expect(glossary.map((g) => g.term)).toEqual(['Ana Costa']);
  });
});

describe('buildGlossary: chapter cutoff', () => {
  it('ignores memories and entities from chapters after the current one', () => {
    const glossary = buildGlossary(
      [
        record(2, [{ term: 'Early', translation: 'Early' }]),
        record(6, [{ term: 'Future', translation: 'Future' }]),
      ],
      [entity('Later Person', 7), entity('Current Person', 5)],
      { currentChapterOrder: 5, budgetTokens: 10_000 },
    );
    expect(glossary.map((g) => g.term)).toEqual(['Early', 'Current Person']);
  });

  it('includes the current chapter itself', () => {
    const glossary = buildGlossary([record(5, [{ term: 'Now', translation: 'Now' }])], [], {
      currentChapterOrder: 5,
      budgetTokens: 10_000,
    });
    expect(glossary).toEqual([{ term: 'Now', translation: 'Now', note: null }]);
  });
});

describe('buildGlossary: budget', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    term: `Term${String(i).padStart(2, '0')}`,
  }));

  it('stays within the token budget', () => {
    const budget = 40;
    const glossary = buildGlossary([record(1, many)], [], {
      currentChapterOrder: 1,
      budgetTokens: budget,
    });
    const used = glossary.reduce((sum, g) => sum + estimateTokens(g.term) + 1, 0);
    expect(glossary.length).toBeGreaterThan(0);
    expect(glossary.length).toBeLessThan(many.length);
    expect(used).toBeLessThanOrEqual(budget);
  });

  it('prefers entries with a chosen translation when the budget is tight', () => {
    const glossary = buildGlossary(
      [record(1, [{ term: 'Plain' }, { term: 'Chosen', translation: 'Elegido' }])],
      [],
      { currentChapterOrder: 1, budgetTokens: 6 },
    );
    expect(glossary).toEqual([{ term: 'Chosen', translation: 'Elegido', note: null }]);
  });

  it('prefers the most recently introduced entries among those without a translation', () => {
    const glossary = buildGlossary(
      [record(1, [{ term: 'Old' }]), record(2, [{ term: 'New' }])],
      [],
      { currentChapterOrder: 2, budgetTokens: 3 },
    );
    expect(glossary.map((g) => g.term)).toEqual(['New']);
  });

  it('returns nothing for a zero budget, and rejects a negative one', () => {
    expect(
      buildGlossary([record(1, many)], [], { currentChapterOrder: 1, budgetTokens: 0 }),
    ).toEqual([]);
    expect(() => buildGlossary([], [], { currentChapterOrder: 1, budgetTokens: -1 })).toThrow(
      RangeError,
    );
  });

  it('orders the output by introduction chapter, then term', () => {
    const glossary = buildGlossary(
      [record(2, [{ term: 'Beta' }]), record(1, [{ term: 'Zeta' }, { term: 'Alpha' }])],
      [],
      LARGE,
    );
    expect(glossary.map((g) => g.term)).toEqual(['Alpha', 'Zeta', 'Beta']);
  });
});
