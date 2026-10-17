/*
 * The analyze stage: one map-reduce analysis of the chapter (memory card and ambience cues), then
 * entity resolution across the series. Earlier chapters only, so the analysis cannot see the future.
 */
import { cueCacheKey } from '@/core/analysis/cue-cache';
import { buildCueReport } from '@/core/analysis/cue-report';
import { analyzeChapter } from '@/core/analysis/map-reduce';
import { PROMPT_VERSION } from '@/core/analysis/prompts';
import type { ChapterMemory } from '@/core/domain';
import { buildPriorContext } from '@/core/memory/codex';
import { resolveEntities } from '@/core/memory/entities';
import { estimateWordCount } from '@/core/text/word-count';

import { stableHash } from '../hash';

import type { StageDefinition } from '../context';
import type { ChapterRecord } from '../ports';

/** Token budget of the earlier-chapter notes sent with each analysis call. */
export const PRIOR_CONTEXT_TOKENS = 1200;

/**
 * The language the memory and its glossary are written in: the series' target language when there
 * is one (so names are suggested in it), otherwise the source language, otherwise the UI language.
 */
export function memoryLanguage(record: ChapterRecord): string {
  return record.series.targetLang ?? record.chapter.sourceLang ?? record.settings.uiLanguage;
}

export const analyzeStage: StageDefinition = {
  stage: 'analyze',
  async prepare(ctx) {
    const { chapters } = ctx.ports;
    const { chapter, series, settings } = ctx.record;
    const sentences = await chapters.getSentences(ctx.chapterId);
    const model = settings.analysisModel;
    const lang = memoryLanguage(ctx.record);
    const snapshot = await chapters.getEntities(series.id);
    const priors = await chapters.getPriorMemories(series.id, chapter.order);
    const priorContext = buildPriorContext(
      snapshot.entities,
      snapshot.facts,
      priors,
      chapter.order,
      PRIOR_CONTEXT_TOKENS,
    );
    const inputHash = stableHash([
      'analyze',
      PROMPT_VERSION,
      model,
      series.title,
      chapter.title,
      lang,
      priorContext,
      sentences.map((s) => s.text),
    ]);
    return {
      inputHash,
      model,
      promptVersion: PROMPT_VERSION,
      skip: sentences.length === 0,
      async execute() {
        const transport = ctx.meter.transport(model, ctx.ports.llm.transportFor(model));
        const speech = sentences.map((s) => ({ idx: s.idx, text: s.text }));
        // Identical text, model and prompt give the same cues: a cache hit makes no cue call.
        const cacheKey = cueCacheKey(
          model,
          speech.map((s) => s.text),
        );
        const cachedCues = await chapters.getCueCache(cacheKey);
        const analysis = await analyzeChapter({
          seriesTitle: series.title,
          chapterTitle: chapter.title,
          lang,
          priorContext,
          sentences: speech,
          wordCount: chapter.wordCount ?? estimateWordCount(sentences.map((s) => s.text).join(' ')),
          callLlm: transport,
          signal: ctx.signal,
          ...(cachedCues === null ? {} : { cachedCues }),
          // A retry reuses the chunks this chapter already paid for (QA-F F-02).
          checkpoints: {
            scope: `${model}|${PROMPT_VERSION}`,
            load: (key) => chapters.loadAnalysisCheckpoint(ctx.chapterId, key),
            save: (key, result) => chapters.saveAnalysisCheckpoint(ctx.chapterId, key, result),
          },
        });
        const memory: ChapterMemory = {
          ...analysis.memory,
          chapterId: ctx.chapterId,
          promptVersion: PROMPT_VERSION,
          model,
        };
        await chapters.saveCues(ctx.chapterId, analysis.cues);
        if (cachedCues === null) await chapters.saveCueCache(cacheKey, analysis.cues);
        await chapters.saveCueReport(
          ctx.chapterId,
          buildCueReport({
            model,
            promptVersion: PROMPT_VERSION,
            createdAt: ctx.ports.clock.now(),
            cues: analysis.cues,
            dropped: analysis.dropped,
            sentences: speech,
            fallbackRan: analysis.fallbackRan,
            fromCache: cachedCues !== null,
          }),
        );
        await chapters.saveMemory(memory);
        await chapters.clearAnalysisCheckpoints(ctx.chapterId);

        const current = await chapters.getEntities(series.id);
        const resolution = resolveEntities(current.entities, memory, chapter.order, {
          seriesId: series.id,
          existingFacts: current.facts,
        });
        await chapters.applyEntityResolution(series.id, resolution);
      },
    };
  },
};
