import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';

import { ChapterMemorySchema, EntityFactSchema, EntitySchema } from '../../core/domain';
import { parseJsonColumn } from '../json-column';
import { chapterMemory, chapters, entities, entityAliases, entityFacts, series } from '../schema';

import type { ChapterMemoryRecord, MemoryFields } from '../../core/analysis/types';
import type { ChapterMemory, Entity, EntityFact, Series } from '../../core/domain';
import type { EntityResolution } from '../../core/memory/entities';
import type { Db } from '../types';

type MemoryRow = typeof chapterMemory.$inferSelect;

export interface SaveMemoryInput {
  chapterId: string;
  memory: MemoryFields;
  model: string;
  promptVersion: string;
  updatedAt: number;
}

/** Display numbers ("Ch. N") are the chapter's 1-based rank in its series, by order. */
function chapterNumbers(db: Db, seriesId: string): Map<string, number> {
  const rows = db
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.seriesId, seriesId))
    .orderBy(asc(chapters.order))
    .all();
  return new Map(rows.map((row, index) => [row.id, index + 1]));
}

function toMemoryRecord(
  row: MemoryRow,
  orders: ReadonlyMap<string, number>,
  numbers: ReadonlyMap<string, number>,
): ChapterMemoryRecord | null {
  const chapterOrder = orders.get(row.chapterId);
  const chapterNumber = numbers.get(row.chapterId);
  if (chapterOrder === undefined || chapterNumber === undefined) return null;
  return {
    chapterOrder,
    chapterNumber,
    memory: parseJsonColumn(ChapterMemorySchema, row.memory, {
      table: 'chapter_memory',
      column: 'memory',
      id: row.chapterId,
    }),
  };
}

function chapterOrders(db: Db, seriesId: string): Map<string, number> {
  const rows = db
    .select({ id: chapters.id, order: chapters.order })
    .from(chapters)
    .where(eq(chapters.seriesId, seriesId))
    .all();
  return new Map(rows.map((row) => [row.id, row.order]));
}

export const memoryRepo = {
  /**
   * Stores (replaces) a chapter's memory card. The card is validated before it is written, so a
   * malformed card never reaches the database. The chapter's id, model and prompt version are
   * stored inside the card too, so every record says which run produced it.
   */
  saveMemory(db: Db, input: SaveMemoryInput): void {
    const card: ChapterMemory = ChapterMemorySchema.parse({
      ...input.memory,
      chapterId: input.chapterId,
      promptVersion: input.promptVersion,
      model: input.model,
    });
    const row = {
      chapterId: input.chapterId,
      promptVersion: input.promptVersion,
      model: input.model,
      memory: JSON.stringify(card),
      updatedAt: input.updatedAt,
    };
    db.insert(chapterMemory)
      .values(row)
      .onConflictDoUpdate({ target: chapterMemory.chapterId, set: row })
      .run();
  },

  /** The memory card of one chapter with its order and display number. Null when none is stored. */
  getMemoryRecord(db: Db, chapterId: string): ChapterMemoryRecord | null {
    const row = db.select().from(chapterMemory).where(eq(chapterMemory.chapterId, chapterId)).get();
    if (!row) return null;
    const chapter = db
      .select({ seriesId: chapters.seriesId })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .get();
    if (!chapter) return null;
    return toMemoryRecord(
      row,
      chapterOrders(db, chapter.seriesId),
      chapterNumbers(db, chapter.seriesId),
    );
  },

  /**
   * Memory cards of the series' chapters strictly before `cutoffOrder`, in reading order. The
   * chapter at the cutoff is never returned: its card contains its ending.
   */
  listMemoriesBefore(db: Db, seriesId: string, cutoffOrder: number): ChapterMemoryRecord[] {
    const orders = chapterOrders(db, seriesId);
    const numbers = chapterNumbers(db, seriesId);
    const rows = db
      .select({ memory: chapterMemory })
      .from(chapterMemory)
      .innerJoin(chapters, eq(chapters.id, chapterMemory.chapterId))
      .where(and(eq(chapters.seriesId, seriesId), lt(chapters.order, cutoffOrder)))
      .orderBy(asc(chapters.order))
      .all();
    const records: ChapterMemoryRecord[] = [];
    for (const { memory } of rows) {
      const record = toMemoryRecord(memory, orders, numbers);
      if (record !== null && record.chapterOrder < cutoffOrder) records.push(record);
    }
    return records;
  },

  /** Every entity of the series, with its stamped aliases. Callers apply the cutoff to the aliases. */
  listEntities(db: Db, seriesId: string): Entity[] {
    const rows = db
      .select()
      .from(entities)
      .where(eq(entities.seriesId, seriesId))
      .orderBy(asc(entities.firstChapterOrder), asc(entities.canonicalName))
      .all();
    if (rows.length === 0) return [];
    const aliasRows = db
      .select({
        entityId: entityAliases.entityId,
        alias: entityAliases.alias,
        firstChapterOrder: entityAliases.firstChapterOrder,
      })
      .from(entityAliases)
      .innerJoin(entities, eq(entities.id, entityAliases.entityId))
      .where(eq(entities.seriesId, seriesId))
      .orderBy(asc(entityAliases.firstChapterOrder), asc(entityAliases.alias))
      .all();
    const byEntity = new Map<string, { alias: string; firstChapterOrder: number }[]>();
    for (const row of aliasRows) {
      const list = byEntity.get(row.entityId) ?? [];
      list.push({ alias: row.alias, firstChapterOrder: row.firstChapterOrder });
      byEntity.set(row.entityId, list);
    }
    return rows.map((row) => EntitySchema.parse({ ...row, aliases: byEntity.get(row.id) ?? [] }));
  },

  /** Entity facts of the series revealed strictly before `cutoffOrder`. */
  listFactsBefore(db: Db, seriesId: string, cutoffOrder: number): EntityFact[] {
    const entityIds = db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.seriesId, seriesId))
      .all()
      .map((row) => row.id);
    if (entityIds.length === 0) return [];
    return db
      .select()
      .from(entityFacts)
      .where(
        and(inArray(entityFacts.entityId, entityIds), lt(entityFacts.chapterOrder, cutoffOrder)),
      )
      .orderBy(asc(entityFacts.chapterOrder), asc(entityFacts.id))
      .all()
      .map((row) => EntityFactSchema.parse(row));
  },

  /** Every entity fact of the series, in chapter order. */
  listFacts(db: Db, seriesId: string): EntityFact[] {
    return db
      .select({ fact: entityFacts })
      .from(entityFacts)
      .innerJoin(entities, eq(entities.id, entityFacts.entityId))
      .where(eq(entities.seriesId, seriesId))
      .orderBy(asc(entityFacts.chapterOrder), asc(entityFacts.id))
      .all()
      .map((row) => EntityFactSchema.parse(row.fact));
  },

  /**
   * Applies one chapter's entity resolution in a single transaction: entities are upserted, their
   * new aliases are inserted with the chapter that revealed them, and new facts are inserted. A
   * repeated alias or fact is left as it is, so a retried chapter is idempotent and the first
   * reveal of a spelling is the one kept.
   */
  saveEntityResolution(
    db: Db,
    seriesId: string,
    chapterId: string,
    resolution: EntityResolution,
  ): void {
    db.transaction((tx) => {
      // The chapter's facts from an earlier analysis go first: the resolution was built without them.
      tx.delete(entityFacts).where(eq(entityFacts.chapterId, chapterId)).run();
      for (const entity of resolution.upserts) {
        if (entity.seriesId !== seriesId) {
          throw new Error(`Entity ${entity.id} belongs to series ${entity.seriesId}`);
        }
        const { aliases, ...row } = entity;
        tx.insert(entities).values(row).onConflictDoUpdate({ target: entities.id, set: row }).run();
        for (const alias of aliases) {
          tx.insert(entityAliases)
            .values({ entityId: entity.id, ...alias })
            .onConflictDoNothing({ target: [entityAliases.entityId, entityAliases.alias] })
            .run();
        }
      }
      for (const fact of resolution.newFacts) {
        tx.insert(entityFacts).values(fact).onConflictDoNothing({ target: entityFacts.id }).run();
      }
    });
  },

  /** Series with at least one analyzed chapter, most recently updated first. Feeds the Ask picker. */
  listAnalyzedSeries(db: Db): Series[] {
    return db
      .selectDistinct({
        id: series.id,
        title: series.title,
        coverUri: series.coverUri,
        coverTint: series.coverTint,
        sourceLang: series.sourceLang,
        targetLang: series.targetLang,
        narrationProfileId: series.narrationProfileId,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
      })
      .from(series)
      .innerJoin(chapters, eq(chapters.seriesId, series.id))
      .innerJoin(chapterMemory, eq(chapterMemory.chapterId, chapters.id))
      .orderBy(desc(series.updatedAt))
      .all();
  },
};
