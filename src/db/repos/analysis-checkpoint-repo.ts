import { and, eq } from 'drizzle-orm';

import { AnalysisCheckpointSchema } from '../../core/analysis/checkpoint';
import { parseJsonColumn } from '../json-column';
import { analysisChunkCheckpoints } from '../schema';

import type { AnalysisCallResult } from '../../core/analysis/analysis-call';
import type { Db } from '../types';

export const analysisCheckpointRepo = {
  /** A chapter's saved chunk reply, validated on read. Null when that chunk has none. */
  get(db: Db, chapterId: string, chunkKey: string): AnalysisCallResult | null {
    const row = db
      .select()
      .from(analysisChunkCheckpoints)
      .where(
        and(
          eq(analysisChunkCheckpoints.chapterId, chapterId),
          eq(analysisChunkCheckpoints.chunkKey, chunkKey),
        ),
      )
      .get();
    if (!row) return null;
    return parseJsonColumn(AnalysisCheckpointSchema, row.response, {
      table: 'analysis_chunk_checkpoints',
      column: 'response',
      id: `${chapterId}:${chunkKey}`,
    });
  },

  /** Stores a chunk reply, replacing any reply saved under the same key. */
  put(
    db: Db,
    chapterId: string,
    chunkKey: string,
    result: AnalysisCallResult,
    createdAt: number,
  ): void {
    const response = JSON.stringify(AnalysisCheckpointSchema.parse(result));
    db.insert(analysisChunkCheckpoints)
      .values({ chapterId, chunkKey, response, createdAt })
      .onConflictDoUpdate({
        target: [analysisChunkCheckpoints.chapterId, analysisChunkCheckpoints.chunkKey],
        set: { response, createdAt },
      })
      .run();
  },

  /** Drops every checkpoint of a chapter, once its analysis is saved. */
  clear(db: Db, chapterId: string): void {
    db.delete(analysisChunkCheckpoints)
      .where(eq(analysisChunkCheckpoints.chapterId, chapterId))
      .run();
  },
};
