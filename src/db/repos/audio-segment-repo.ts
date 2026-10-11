import { and, asc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';

import { AudioSegmentSchema } from '../../core/domain';
import { DbValidationError, parseJsonColumn } from '../json-column';
import { audioSegments } from '../schema';

import type { AudioSegment } from '../../core/domain';
import type { Db } from '../types';

type AudioSegmentRow = typeof audioSegments.$inferSelect;

const OffsetsSchema = z.array(z.number().int().nonnegative());

/** Maps a stored row to a validated segment. Malformed rows throw DbValidationError. */
export function toAudioSegment(row: AudioSegmentRow): AudioSegment {
  const location = { table: 'audio_segments', column: 'sentence_offsets_ms', id: row.id };
  const sentenceOffsetsMs = parseJsonColumn(OffsetsSchema, row.sentenceOffsetsMs, location);
  const result = AudioSegmentSchema.safeParse({ ...row, sentenceOffsetsMs });
  if (!result.success) {
    throw new DbValidationError(
      { table: 'audio_segments', column: 'row', id: row.id },
      result.error.issues[0]?.message ?? 'schema mismatch',
    );
  }
  return result.data;
}

export const audioSegmentRepo = {
  /** Validates the segment, then stores it. The (chapter, idx) pair is unique. */
  insert(db: Db, segment: AudioSegment): void {
    const valid = AudioSegmentSchema.parse(segment);
    db.insert(audioSegments)
      .values({ ...valid, sentenceOffsetsMs: JSON.stringify(valid.sentenceOffsetsMs) })
      .run();
  },

  /** A chapter's segments in playback order, optionally from `fromIdx` onwards. */
  listByChapter(db: Db, chapterId: string, fromIdx = 0): AudioSegment[] {
    return db
      .select()
      .from(audioSegments)
      .where(and(eq(audioSegments.chapterId, chapterId), gte(audioSegments.idx, fromIdx)))
      .orderBy(asc(audioSegments.idx))
      .all()
      .map(toAudioSegment);
  },

  /** Removes segment `idx` and every later segment of the chapter, so narration can be redone from there. */
  deleteFrom(db: Db, chapterId: string, idx: number): void {
    db.delete(audioSegments)
      .where(and(eq(audioSegments.chapterId, chapterId), gte(audioSegments.idx, idx)))
      .run();
  },
};
