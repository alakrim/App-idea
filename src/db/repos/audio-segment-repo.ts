import { and, asc, count, eq, gte } from 'drizzle-orm';
import { z } from 'zod';

import { AudioSegmentSchema } from '../../core/domain';
import { DbValidationError, parseJsonColumn } from '../json-column';
import { audioSegments, chapters } from '../schema';

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
  /**
   * The chapters of a series that can be heard: the ones whose first passage is saved. The first
   * passage is the start of the unbroken run that `playableRun` takes, so this is the same rule.
   */
  playableChapterIds(db: Db, seriesId: string): Set<string> {
    return new Set(
      db
        .select({ chapterId: audioSegments.chapterId })
        .from(audioSegments)
        .innerJoin(chapters, eq(chapters.id, audioSegments.chapterId))
        .where(and(eq(chapters.seriesId, seriesId), eq(audioSegments.idx, 0)))
        .all()
        .map((row) => row.chapterId),
    );
  },

  /** Validates the segment, then stores it. The (chapter, idx) pair is unique. */
  /** Saves a segment. A segment already saved at the same index is replaced by the new one. */
  insert(db: Db, segment: AudioSegment): void {
    const valid = AudioSegmentSchema.parse(segment);
    const row = { ...valid, sentenceOffsetsMs: JSON.stringify(valid.sentenceOffsetsMs) };
    db.insert(audioSegments)
      .values(row)
      .onConflictDoUpdate({ target: [audioSegments.chapterId, audioSegments.idx], set: row })
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

  /** How many segments a chapter has. A count, so no row is read or validated. */
  countByChapter(db: Db, chapterId: string): number {
    return (
      db
        .select({ total: count() })
        .from(audioSegments)
        .where(eq(audioSegments.chapterId, chapterId))
        .get()?.total ?? 0
    );
  },

  /** Removes segment `idx` and every later segment of the chapter, so narration can be redone from there. */
  deleteFrom(db: Db, chapterId: string, idx: number): void {
    db.delete(audioSegments)
      .where(and(eq(audioSegments.chapterId, chapterId), gte(audioSegments.idx, idx)))
      .run();
  },
};
