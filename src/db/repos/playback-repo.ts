import { audioSegmentRepo } from './audio-segment-repo';
import { chapterRepo } from './chapter-repo';
import { cueRepo } from './cue-repo';
import { seriesRepo } from './series-repo';
import { textRepo } from './text-repo';

import type { AmbienceCue, AudioSegment, Chapter, Paragraph, Sentence, Series } from '../../core/domain';
import type { Db } from '../types';

/** Upper bound for "every sentence of the chapter". Sentence indices are small integers. */
const ALL_SENTENCES_TO = Number.MAX_SAFE_INTEGER;

/** Everything the player needs for one chapter, read in one pass. Only enabled cues are included. */
export interface ChapterForPlayback {
  chapter: Chapter;
  series: Series;
  /** Narration files in playback order. May be a partial list while the chapter is still narrating. */
  segments: AudioSegment[];
  cues: AmbienceCue[];
  paragraphs: Paragraph[];
  /** Every sentence of the chapter, with its translation when one exists. */
  sentences: Sentence[];
}

/** Read-only queries behind the player. Writes belong to the pipeline and the position repo. */
export const playbackRepo = {
  /** Null when the chapter does not exist. */
  getChapterForPlayback(db: Db, chapterId: string): ChapterForPlayback | null {
    const chapter = chapterRepo.get(db, chapterId);
    if (!chapter) return null;
    const series = seriesRepo.get(db, chapter.seriesId);
    if (!series) return null;

    return {
      chapter,
      series,
      segments: audioSegmentRepo.listByChapter(db, chapterId),
      cues: cueRepo.listForChapter(db, chapterId).filter((cue) => cue.enabled),
      paragraphs: textRepo.listParagraphs(db, chapterId),
      sentences: textRepo.getRange(db, chapterId, 0, ALL_SENTENCES_TO),
    };
  },
};
