/*
 * ChapterStore on the library's repositories. Rows go through the existing repos (no SQL here), and
 * the extracted text and the audio files go through LibraryFiles. The narration profile is upserted
 * from the settings every time a chapter is loaded, so a run always records the profile it used.
 */
import type { ChapterMemoryRecord, MemoryFields, ValidatedCue } from '@/core/analysis/types';
import type { ChapterMemory, Id, IdGenerator } from '@/core/domain';
import type { EntityResolution } from '@/core/memory/entities';
import type {
  ChapterMetaPatch,
  ChapterRecord,
  ChapterStore,
  Clock,
  EntitySnapshot,
  StoredSentence,
} from '@/core/pipeline/ports';
import type { ChapterText } from '@/core/text/build';
import { ambienceReportRepo } from '@/db/repos/ambience-report-repo';
import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { cueCacheRepo } from '@/db/repos/cue-cache-repo';
import { cueRepo } from '@/db/repos/cue-repo';
import { memoryRepo } from '@/db/repos/memory-repo';
import { narrationProfileRepo } from '@/db/repos/narration-profile-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { settingsRepo } from '@/db/repos/settings-repo';
import { textRepo } from '@/db/repos/text-repo';
import type { Translation } from '@/db/repos/text-repo';
import type { Db } from '@/db/types';

import { narrationProfileFor } from '../narration-id';

import type { LibraryFiles } from '../library-files';

export const SOURCE_TEXT_PATH = (chapterId: Id): string => `sources/${chapterId}/text.txt`;

/** Upper bound for "every sentence of the chapter". Sentence indices are far below it. */
const ALL_SENTENCES = 2 ** 31 - 1;

export interface ChapterStoreDeps {
  readonly db: Db;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly files: LibraryFiles;
}

export function createChapterStore(deps: ChapterStoreDeps): ChapterStore {
  const { db, clock, ids, files } = deps;

  return {
    async load(chapterId): Promise<ChapterRecord | null> {
      const chapter = chapterRepo.get(db, chapterId);
      if (!chapter) return null;
      const series = seriesRepo.get(db, chapter.seriesId);
      if (!series) return null;
      const settings = settingsRepo.getSettings(db);
      const narration = narrationProfileFor(settings.narration);
      narrationProfileRepo.upsert(db, narration);
      return { chapter, series, settings, narration };
    },

    async setStatus(chapterId, status) {
      chapterRepo.setStatus(db, chapterId, status, clock.now());
    },

    async setMeta(chapterId, patch: ChapterMetaPatch) {
      const values = {
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.sourceLang === undefined ? {} : { sourceLang: patch.sourceLang }),
        ...(patch.wordCount === undefined ? {} : { wordCount: patch.wordCount }),
        ...(patch.durationMs === undefined ? {} : { durationMs: patch.durationMs }),
      };
      chapterRepo.update(db, chapterId, { ...values, updatedAt: clock.now() });
    },

    async getSourceText(chapterId) {
      return files.readText(SOURCE_TEXT_PATH(chapterId));
    },

    async saveSourceText(chapterId, text) {
      await files.write(SOURCE_TEXT_PATH(chapterId), text);
    },

    async replaceText(chapterId, text: ChapterText) {
      textRepo.replaceChapterText(db, chapterId, {
        paragraphs: text.paragraphs.map((p) => ({
          idx: p.idx,
          sentenceStart: p.sentenceStart,
          sentenceEnd: p.sentenceEnd,
          kind: p.kind,
        })),
        sentences: text.sentences.map((s) => ({
          chapterId,
          idx: s.idx,
          paragraphIdx: s.paragraphIdx,
          text: s.text,
          translated: null,
          charCount: s.charCount,
        })),
      });
    },

    async getSentences(chapterId): Promise<StoredSentence[]> {
      const kindOf = new Map(
        textRepo.listParagraphs(db, chapterId).map((p) => [p.idx, p.kind] as const),
      );
      return textRepo.getRange(db, chapterId, 0, ALL_SENTENCES).map((s) => ({
        idx: s.idx,
        paragraphIdx: s.paragraphIdx,
        kind: kindOf.get(s.paragraphIdx) ?? 'text',
        text: s.text,
        translated: s.translated,
        charCount: s.charCount,
      }));
    },

    async setTranslations(chapterId, translations, partialIdx) {
      const fallback = new Set(partialIdx);
      const rows: Translation[] = [];
      for (const [idx, translated] of translations) {
        if (!fallback.has(idx)) rows.push({ idx, translated });
      }
      for (const idx of fallback) rows.push({ idx, translated: null });
      textRepo.setTranslations(db, chapterId, rows);
    },

    async saveCues(chapterId, cues: readonly ValidatedCue[]) {
      cueRepo.replaceForChapter(
        db,
        chapterId,
        cues.map((cue) => ({ ...cue, id: ids(), chapterId, enabled: true })),
      );
    },

    async getCueCache(key) {
      return cueCacheRepo.get(db, key);
    },

    async saveCueCache(key, cues) {
      cueCacheRepo.put(db, key, cues, clock.now());
    },

    async saveCueReport(chapterId, report) {
      ambienceReportRepo.upsert(db, chapterId, report);
    },

    async saveMemory(memory: ChapterMemory) {
      const { chapterId, promptVersion, model, ...fields } = memory;
      memoryRepo.saveMemory(db, {
        chapterId,
        memory: fields as MemoryFields,
        model,
        promptVersion,
        updatedAt: clock.now(),
      });
    },

    async getMemoryRecord(chapterId): Promise<ChapterMemoryRecord | null> {
      return memoryRepo.getMemoryRecord(db, chapterId);
    },

    async getPriorMemories(seriesId, beforeOrder) {
      return memoryRepo.listMemoriesBefore(db, seriesId, beforeOrder);
    },

    async getEntities(seriesId): Promise<EntitySnapshot> {
      return {
        entities: memoryRepo.listEntities(db, seriesId),
        facts: memoryRepo.listFacts(db, seriesId),
      };
    },

    async applyEntityResolution(seriesId, resolution: EntityResolution) {
      memoryRepo.saveEntityResolution(db, seriesId, resolution);
    },

    async listAudioSegments(chapterId) {
      return audioSegmentRepo.listByChapter(db, chapterId);
    },

    async saveAudioSegment(segment) {
      audioSegmentRepo.insert(db, segment);
    },

    async deleteAudioFrom(chapterId, segmentIdx) {
      audioSegmentRepo.deleteFrom(db, chapterId, segmentIdx);
    },
  };
}
