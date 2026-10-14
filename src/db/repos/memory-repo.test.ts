import { chapterRepo } from './chapter-repo';
import { memoryRepo } from './memory-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

import type { MemoryFields } from '../../core/analysis/types';
import type { Entity, EntityFact } from '../../core/domain';

function fields(summary: string, overrides: Partial<MemoryFields> = {}): MemoryFields {
  return {
    summary,
    keyEvents: [`${summary} event`],
    characters: [],
    places: [],
    items: [],
    relationships: [],
    openThreads: [],
    glossary: [],
    ...overrides,
  };
}

/** Series 1 with three chapters: id(1) order 1, id(2) order 2, id(3) order 3. */
function seedSeries(db: ReturnType<typeof createTestDb>['db']) {
  seriesRepo.insert(db, seriesRow(1));
  seriesRepo.insert(db, seriesRow(2, { title: 'Other series' }));
  chapterRepo.insert(db, chapterRow(1, 1, 1));
  chapterRepo.insert(db, chapterRow(2, 1, 2));
  chapterRepo.insert(db, chapterRow(3, 1, 3));
  chapterRepo.insert(db, chapterRow(4, 2, 1));
}

function saveCard(
  db: ReturnType<typeof createTestDb>['db'],
  chapterN: number,
  summary: string,
): void {
  memoryRepo.saveMemory(db, {
    chapterId: id(chapterN),
    memory: fields(summary),
    model: 'anthropic/test',
    promptVersion: 'memory-v1',
    updatedAt: T0,
  });
}

const LIN_MO: Entity = {
  id: id(101),
  seriesId: id(1),
  kind: 'character',
  canonicalName: 'Lin Mo',
  aliases: [{ alias: 'Mo', firstChapterOrder: 1 }],
  firstChapterOrder: 1,
};

function fact(n: number, chapterN: number, order: number, text: string): EntityFact {
  return {
    id: id(200 + n),
    entityId: id(101),
    chapterId: id(chapterN),
    chapterOrder: order,
    fact: text,
  };
}

describe('memoryRepo.saveMemory and getMemoryRecord', () => {
  it('stores a card and returns it with its order and display number', () => {
    const { db } = createTestDb();
    seedSeries(db);
    saveCard(db, 2, 'Second chapter');

    const record = memoryRepo.getMemoryRecord(db, id(2));

    expect(record).toEqual({
      chapterOrder: 2,
      chapterNumber: 2,
      memory: expect.objectContaining({
        chapterId: id(2),
        model: 'anthropic/test',
        promptVersion: 'memory-v1',
        summary: 'Second chapter',
      }),
    });
  });

  it('replaces the card when the same chapter is saved again', () => {
    const { db } = createTestDb();
    seedSeries(db);
    saveCard(db, 1, 'First draft');
    saveCard(db, 1, 'Second draft');

    expect(memoryRepo.getMemoryRecord(db, id(1))?.memory.summary).toBe('Second draft');
  });

  it('refuses an invalid card and writes nothing', () => {
    const { db } = createTestDb();
    seedSeries(db);
    const tooManyEvents = fields('Too many', {
      keyEvents: Array.from({ length: 11 }, (_, i) => `event ${i}`),
    });

    expect(() =>
      memoryRepo.saveMemory(db, {
        chapterId: id(1),
        memory: tooManyEvents,
        model: 'm',
        promptVersion: 'v',
        updatedAt: T0,
      }),
    ).toThrow();
    expect(memoryRepo.getMemoryRecord(db, id(1))).toBeNull();
  });
});

describe('memoryRepo.listMemoriesBefore', () => {
  it('never returns the cutoff chapter or any later chapter', () => {
    const { db } = createTestDb();
    seedSeries(db);
    saveCard(db, 1, 'Chapter one');
    saveCard(db, 2, 'Chapter two');
    saveCard(db, 3, 'CURRENT_CHAPTER_ENDING');

    const records = memoryRepo.listMemoriesBefore(db, id(1), 3);

    expect(records.map((r) => r.chapterNumber)).toEqual([1, 2]);
    expect(JSON.stringify(records)).not.toContain('CURRENT_CHAPTER_ENDING');
  });

  it('returns nothing for the first chapter, and never another series', () => {
    const { db } = createTestDb();
    seedSeries(db);
    saveCard(db, 1, 'Chapter one');
    saveCard(db, 4, 'Other series chapter');

    expect(memoryRepo.listMemoriesBefore(db, id(1), 1)).toEqual([]);
    expect(memoryRepo.listMemoriesBefore(db, id(1), 9).map((r) => r.chapterNumber)).toEqual([1]);
  });
});

describe('memoryRepo entities and facts', () => {
  it('upserts entities and inserts facts in one transaction, idempotently', () => {
    const { db } = createTestDb();
    seedSeries(db);
    const resolution = {
      upserts: [LIN_MO],
      newFacts: [fact(1, 1, 1, 'Is a disciple')],
    };

    memoryRepo.saveEntityResolution(db, id(1), id(1), resolution);
    memoryRepo.saveEntityResolution(db, id(1), id(1), resolution);

    expect(memoryRepo.listEntities(db, id(1))).toEqual([LIN_MO]);
    expect(memoryRepo.listFactsBefore(db, id(1), 9)).toHaveLength(1);
  });

  it('replaces a chapter\'s facts on re-analysis, rather than adding to them', () => {
    const { db } = createTestDb();
    seedSeries(db);
    memoryRepo.saveEntityResolution(db, id(1), id(1), {
      upserts: [LIN_MO],
      newFacts: [fact(1, 1, 1, 'Is a disciple'), fact(2, 1, 1, 'Lives by the sea')],
    });

    // The second analysis of chapter 1 finds only one of those facts.
    memoryRepo.saveEntityResolution(db, id(1), id(1), {
      upserts: [LIN_MO],
      newFacts: [fact(3, 1, 1, 'Is a disciple')],
    });

    expect(memoryRepo.listFacts(db, id(1)).map((f) => f.fact)).toEqual(['Is a disciple']);
  });

  it('lists only facts revealed strictly before the cutoff order', () => {
    const { db } = createTestDb();
    seedSeries(db);
    memoryRepo.saveEntityResolution(db, id(1), id(1), {
      upserts: [LIN_MO],
      newFacts: [fact(1, 1, 1, 'Is a disciple'), fact(2, 3, 3, 'Is the master')],
    });

    const facts = memoryRepo.listFactsBefore(db, id(1), 3);

    expect(facts.map((f) => f.fact)).toEqual(['Is a disciple']);
  });

  it('rejects an entity that belongs to another series and writes nothing', () => {
    const { db } = createTestDb();
    seedSeries(db);
    const foreign = { ...LIN_MO, id: id(102), seriesId: id(2) };

    expect(() =>
      memoryRepo.saveEntityResolution(db, id(1), id(1), {
        upserts: [LIN_MO, foreign],
        newFacts: [fact(1, 1, 1, 'Is a disciple')],
      }),
    ).toThrow(/belongs to series/);
    expect(memoryRepo.listEntities(db, id(1))).toEqual([]);
    expect(memoryRepo.listFactsBefore(db, id(1), 9)).toEqual([]);
  });
});

describe('memoryRepo.listFacts', () => {
  it('lists every fact of the series, in chapter order, and no other series', () => {
    const { db } = createTestDb();
    seedSeries(db);
    memoryRepo.saveEntityResolution(db, id(1), id(1), {
      upserts: [LIN_MO],
      newFacts: [fact(2, 3, 3, 'Is the master'), fact(1, 1, 1, 'Is a disciple')],
    });

    expect(memoryRepo.listFacts(db, id(1)).map((f) => f.fact)).toEqual([
      'Is a disciple',
      'Is the master',
    ]);
    expect(memoryRepo.listFacts(db, id(2))).toEqual([]);
  });
});

describe('memoryRepo.listAnalyzedSeries', () => {
  it('lists only series with at least one analyzed chapter', () => {
    const { db } = createTestDb();
    seedSeries(db);
    saveCard(db, 4, 'Other series chapter');

    expect(memoryRepo.listAnalyzedSeries(db).map((s) => s.id)).toEqual([id(2)]);
  });
});
