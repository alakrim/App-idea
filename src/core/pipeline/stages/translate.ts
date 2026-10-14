/*
 * The translate stage: sentence-aligned translation with a glossary built from the memories and
 * entities up to this chapter. Skipped when there is no target language, or when the target is the
 * source language.
 */
import type { ChapterMemoryRecord } from '@/core/analysis/types';
import { buildGlossary } from '@/core/translate/glossary';
import { TRANSLATE_PROMPT_VERSION } from '@/core/translate/prompts';
import { translateChapter } from '@/core/translate/translate-chapter';

import { stableHash } from '../hash';

import type { StageDefinition } from '../context';

/** Glossary budget for one chapter, in estimated tokens. */
export const GLOSSARY_TOKENS = 800;

/**
 * Translation requests in flight at once. Each chunk still sees the translations of the chunks
 * before it when they are done, and reads "(translation pending)" for the rest.
 */
export const TRANSLATE_CONCURRENCY = 3;

export const translateStage: StageDefinition = {
  stage: 'translate',
  async prepare(ctx) {
    const { chapters } = ctx.ports;
    const { chapter, series, settings } = ctx.record;
    const sourceLang = chapter.sourceLang ?? series.sourceLang;
    const targetLang = series.targetLang;
    const sentences = await chapters.getSentences(ctx.chapterId);
    if (
      targetLang === null ||
      sourceLang === null ||
      targetLang.toLowerCase() === sourceLang.toLowerCase() ||
      sentences.length === 0
    ) {
      return {
        inputHash: stableHash(['translate', 'skipped', chapter.id]),
        model: null,
        promptVersion: null,
        skip: true,
        async execute() {},
      };
    }

    const model = settings.translationModel;
    const priors = await chapters.getPriorMemories(series.id, chapter.order);
    const current = await chapters.getMemoryRecord(ctx.chapterId);
    const records: ChapterMemoryRecord[] = current ? [...priors, current] : priors;
    const snapshot = await chapters.getEntities(series.id);
    const glossary = buildGlossary(records, snapshot.entities, {
      currentChapterOrder: chapter.order,
      budgetTokens: GLOSSARY_TOKENS,
    });
    const inputHash = stableHash([
      'translate',
      TRANSLATE_PROMPT_VERSION,
      model,
      sourceLang,
      targetLang,
      glossary,
      sentences.map((s) => s.text),
    ]);
    return {
      inputHash,
      model,
      promptVersion: TRANSLATE_PROMPT_VERSION,
      skip: false,
      async execute() {
        const transport = ctx.meter.transport(model, ctx.ports.llm.transportFor(model));
        const result = await translateChapter({
          sentences: sentences.map((s) => ({ idx: s.idx, text: s.text })),
          sourceLang,
          targetLang,
          glossary,
          llm: transport,
          concurrency: TRANSLATE_CONCURRENCY,
          signal: ctx.signal,
          onProgress: ({ translated, total }) =>
            ctx.emit({
              type: 'progress',
              chapterId: ctx.chapterId,
              stage: 'translate',
              progress: total === 0 ? 1 : translated / total,
            }),
        });
        await chapters.setTranslations(
          ctx.chapterId,
          result.translations,
          result.partialIdx,
          targetLang,
        );
      },
    };
  },
};
