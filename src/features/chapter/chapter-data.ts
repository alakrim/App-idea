import type { CueReport } from '@/core/analysis/cue-report';
import type { AmbienceCue, Chapter, Job, ParagraphKind, Series } from '@/core/domain';
import { ambienceReportRepo } from '@/db/repos/ambience-report-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { cueRepo } from '@/db/repos/cue-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import type { Db } from '@/db/types';

export const CHAPTER_SCREEN_TABLES = [
  'chapters',
  'series',
  'jobs',
  'paragraphs',
  'sentences',
  'ambience_cues',
  'ambience_reports',
];

export interface ReadingSentence {
  idx: number;
  text: string;
  translated: string | null;
}

export interface ReadingParagraph {
  idx: number;
  kind: ParagraphKind;
  sentences: ReadingSentence[];
}

export interface ChapterScreenData {
  chapter: Chapter | null;
  series: Series | null;
  jobs: Job[];
  paragraphs: ReadingParagraph[];
  cues: AmbienceCue[];
  /** The cue report of the latest analysis. Null until the chapter has been analysed. */
  cueReport: CueReport | null;
}

export function readChapterScreen(db: Db, chapterId: string): ChapterScreenData {
  const chapter = chapterRepo.get(db, chapterId);
  if (chapter === null) {
    return { chapter: null, series: null, jobs: [], paragraphs: [], cues: [], cueReport: null };
  }

  const sentences = new Map(
    textRepo
      .getRange(db, chapterId, 0, Number.MAX_SAFE_INTEGER)
      .map((sentence) => [sentence.idx, sentence] as const),
  );
  const paragraphs = textRepo.listParagraphs(db, chapterId).map((paragraph) => {
    const items: ReadingSentence[] = [];
    for (let idx = paragraph.sentenceStart; idx < paragraph.sentenceEnd; idx += 1) {
      const sentence = sentences.get(idx);
      if (sentence) items.push({ idx, text: sentence.text, translated: sentence.translated });
    }
    return { idx: paragraph.idx, kind: paragraph.kind, sentences: items };
  });

  return {
    chapter,
    series: seriesRepo.get(db, chapter.seriesId),
    jobs: jobRepo.listForChapter(db, chapterId),
    paragraphs,
    cues: cueRepo.listForChapter(db, chapterId),
    cueReport: ambienceReportRepo.get(db, chapterId),
  };
}

/** True once any sentence has a translation, which is when the Translation view becomes available. */
export function isTranslated(paragraphs: readonly ReadingParagraph[]): boolean {
  return paragraphs.some((paragraph) => paragraph.sentences.some((s) => s.translated !== null));
}
