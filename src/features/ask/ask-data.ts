import { getTableName } from 'drizzle-orm';

import type { QaMessage } from '@/core/domain';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { memoryRepo } from '@/db/repos/memory-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { qaRepo } from '@/db/repos/qa-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import {
  chapterMemory,
  chapters,
  entities,
  entityFacts,
  listeningPositions,
  qaMessages,
  series,
} from '@/db/schema';
import type { Db } from '@/db/types';

import { suggestQuestions } from './suggestions';

/** Tables the Ask screen reads. A write to any of them re-runs the read. */
export const ASK_TABLES = [
  getTableName(series),
  getTableName(chapters),
  getTableName(listeningPositions),
  getTableName(qaMessages),
  getTableName(chapterMemory),
  getTableName(entities),
  getTableName(entityFacts),
];

export interface AskSeriesOption {
  id: string;
  title: string;
}

export interface AskChapter {
  chapterId: string;
  /** 1-based display number, the one the answers cite ("Ch. N"). */
  number: number;
  title: string;
}

/** Where the listener is. This is the spoiler cutoff shown in the shield. */
export interface AskCutoff {
  chapterId: string;
  chapterNumber: number;
  chapterCount: number;
  /** Chapters reached as a share of the series, the same measure the library uses. */
  reachedShare: number;
}

export interface AskSeriesData {
  seriesId: string;
  title: string;
  chapters: AskChapter[];
  /** Null when nothing has been played, so there is no cutoff and no answers yet. */
  cutoff: AskCutoff | null;
  suggestions: string[];
  thread: QaMessage[];
}

/** Series that have at least one analyzed chapter, the only ones Q&A can answer about. */
export function readAskSeriesOptions(db: Db): AskSeriesOption[] {
  return memoryRepo.listAnalyzedSeries(db).map((s) => ({ id: s.id, title: s.title }));
}

export function readAskSeriesData(db: Db, seriesId: string): AskSeriesData | null {
  const seriesRow = seriesRepo.get(db, seriesId);
  if (seriesRow === null) return null;

  const ordered = chapterRepo.listBySeries(db, seriesId);
  const chapterList: AskChapter[] = ordered.map((chapter, index) => ({
    chapterId: chapter.id,
    number: index + 1,
    title: chapter.title,
  }));

  const position = positionRepo.get(db, seriesId);
  const cutoff = position === null ? null : cutoffFor(position.furthest.chapterId, ordered);
  const suggestions =
    position === null || cutoff === null
      ? []
      : suggestQuestions({
          entities: memoryRepo.listEntities(db, seriesId),
          facts: memoryRepo.listFactsBefore(db, seriesId, position.furthest.chapterOrder),
          cutoffOrder: position.furthest.chapterOrder,
          cutoffChapterNumber: cutoff.chapterNumber,
        });

  return {
    seriesId,
    title: seriesRow.title,
    chapters: chapterList,
    cutoff,
    suggestions,
    thread: qaRepo.listForSeries(db, seriesId),
  };
}

function cutoffFor(chapterId: string, ordered: readonly { id: string }[]): AskCutoff | null {
  const index = ordered.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) return null;
  return {
    chapterId,
    chapterNumber: index + 1,
    chapterCount: ordered.length,
    reachedShare: (index + 1) / ordered.length,
  };
}
