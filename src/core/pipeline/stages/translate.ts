/*
 * The translate stage: sentence-aligned translation, streamed in reading order (ADR-0008).
 *
 * The opening window (about 90 s of narration) is translated at once, with a glossary from earlier
 * chapters and series entities only. The rest waits for the chapter's analysis, so its glossary also
 * holds this chapter's names. Every chunk is saved and published to the spoken-text gate as soon as it
 * is final, so narration can start while the rest is still being translated.
 *
 * Skipped when there is no target language, or when the target is the source language.
 */
import type { ChapterMemoryRecord } from '@/core/analysis/types';
import type { Lang } from '@/core/domain';
import { firstWindowEnd } from '@/core/translate/first-window';
import { buildGlossary } from '@/core/translate/glossary';
import { TRANSLATE_PROMPT_VERSION } from '@/core/translate/prompts';
import { translateChapter } from '@/core/translate/translate-chapter';
import type { GlossaryEntry } from '@/core/translate/types';

import { untilSettled } from '../abort';
import { stableHash } from '../hash';
import { analyzeStage } from './analyze';

import type { FlowContext, StageContext, StageDefinition } from '../context';
import type { ChapterRecord, StoredSentence } from '../ports';

/** Glossary budget for one chapter, in estimated tokens. */
export const GLOSSARY_TOKENS = 800;
/** Chunks in flight at once. Their results are still saved in reading order. */
export const TRANSLATE_CONCURRENCY = 2;

/** The languages a chapter is translated between, or null when it is read in its own language. */
export function translationPair(
  record: ChapterRecord,
): { readonly sourceLang: Lang; readonly targetLang: Lang } | null {
  const sourceLang = record.chapter.sourceLang ?? record.series.sourceLang;
  const targetLang = record.series.targetLang;
  if (
    targetLang === null ||
    sourceLang === null ||
    targetLang.toLowerCase() === sourceLang.toLowerCase()
  ) {
    return null;
  }
  return { sourceLang, targetLang };
}

/** Every sentence's final text when nothing is translated: the source text. */
function sourceTexts(sentences: readonly StoredSentence[]): Map<number, string> {
  return new Map(sentences.map((s) => [s.idx, s.text] as const));
}

/** Every sentence's stored spoken text: its translation where one is stored, else its source. */
export function storedSpokenTexts(sentences: readonly StoredSentence[]): Map<number, string> {
  return new Map(sentences.map((s) => [s.idx, s.translated ?? s.text] as const));
}

/** The translations stored for the sentences, leaving out the partial ones that hold no translation. */
function storedTranslations(sentences: readonly StoredSentence[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const s of sentences) if (s.translated !== null) out.set(s.idx, s.translated);
  return out;
}

export const translateStage: StageDefinition<FlowContext> = {
  stage: 'translate',
  async prepare(ctx) {
    const { chapters, jobs } = ctx.ports;
    const { chapter, series, settings } = ctx.record;
    const pair = translationPair(ctx.record);
    const sentences = await chapters.getSentences(ctx.chapterId);
    if (pair === null || sentences.length === 0) {
      return {
        inputHash: stableHash(['translate', 'skipped', chapter.id]),
        model: null,
        promptVersion: null,
        skip: true,
        settled: sourceTexts(sentences),
        async execute() {},
      };
    }

    const model = settings.translationModel;
    const priors = await chapters.getPriorMemories(series.id, chapter.order);
    const snapshot = await chapters.getEntities(series.id);
    // Only the chapters and entities before this one: this chapter's analysis may be writing its own
    // entities at the same time, and the opening window must not depend on that.
    const priorGlossary = buildGlossary(priors, snapshot.entities, {
      currentChapterOrder: chapter.order - 1,
      budgetTokens: GLOSSARY_TOKENS,
    });
    // The hash covers the analysis input, not the glossary snapshot. The analysis input only sees
    // earlier chapters, so it is the same whether or not this chapter's analysis has already run. The
    // glossary snapshot is not, which is why it stays out of the hash.
    const analysisHash = (await analyzeStage.prepare(ctx)).inputHash;
    const inputHash = stableHash([
      'translate',
      TRANSLATE_PROMPT_VERSION,
      model,
      pair.sourceLang,
      pair.targetLang,
      analysisHash,
      sentences.map((s) => s.text),
    ]);

    const existing = await jobs.get(ctx.chapterId, 'translate');
    const sameInput = existing?.inputHash === inputHash;
    // A job that stopped midway keeps the translations it saved for this same input, so they are not bought again.
    const prefill = sameInput && !ctx.options.force ? storedTranslations(sentences) : new Map();
    return {
      inputHash,
      model,
      promptVersion: TRANSLATE_PROMPT_VERSION,
      skip: false,
      settled: existing?.status === 'done' && sameInput ? storedSpokenTexts(sentences) : undefined,
      async execute() {
        await runTranslation(ctx, {
          sentences,
          pair,
          model,
          priorGlossary,
          prefill,
        });
      },
    };
  },
};

interface TranslationPlan {
  readonly sentences: readonly StoredSentence[];
  readonly pair: { readonly sourceLang: Lang; readonly targetLang: Lang };
  readonly model: string;
  readonly priorGlossary: readonly GlossaryEntry[];
  readonly prefill: ReadonlyMap<number, string>;
}

async function runTranslation(ctx: FlowContext, plan: TranslationPlan): Promise<void> {
  const { chapters } = ctx.ports;
  const { sentences, pair, model, prefill } = plan;
  const transport = ctx.meter.transport(model, ctx.ports.llm.transportFor(model));
  const sources = sentences.map((s) => ({ idx: s.idx, text: s.text }));
  const total = sentences.length;

  // Results that are already final are published before any call is made.
  ctx.spoken.publish(prefill);
  const persist = async (commit: {
    readonly translations: ReadonlyMap<number, string>;
    readonly partialIdx: readonly number[];
  }): Promise<void> => {
    await chapters.setTranslations(ctx.chapterId, commit.translations, commit.partialIdx);
    ctx.spoken.publish(commit.translations);
  };
  const onProgress = ({ translated }: { translated: number }): void =>
    ctx.emit({
      type: 'progress',
      chapterId: ctx.chapterId,
      stage: 'translate',
      progress: total === 0 ? 1 : translated / total,
    });
  const common = {
    sentences: sources,
    sourceLang: pair.sourceLang,
    targetLang: pair.targetLang,
    llm: transport,
    signal: ctx.signal,
    concurrency: TRANSLATE_CONCURRENCY,
    onProgress,
    onCommit: persist,
  };

  const windowEnd = firstWindowEnd(sources, pair.targetLang);
  const opening = await translateChapter({
    ...common,
    glossary: plan.priorGlossary,
    translated: prefill,
    range: { fromIdx: -Infinity, toIdx: windowEnd },
  });

  // The rest needs this chapter's memory in the glossary, so it waits for the analysis.
  await untilSettled(ctx.analysisDone, ctx.signal);
  const glossary = await fullGlossary(ctx);
  await translateChapter({
    ...common,
    glossary,
    translated: opening.translations,
    range: { fromIdx: windowEnd + 1, toIdx: Infinity },
  });
}

/** The glossary once the chapter's own memory is stored: earlier chapters and this one. */
async function fullGlossary(ctx: StageContext): Promise<readonly GlossaryEntry[]> {
  const { chapters } = ctx.ports;
  const { chapter, series } = ctx.record;
  const priors = await chapters.getPriorMemories(series.id, chapter.order);
  const current = await chapters.getMemoryRecord(ctx.chapterId);
  const records: ChapterMemoryRecord[] = current ? [...priors, current] : priors;
  const snapshot = await chapters.getEntities(series.id);
  return buildGlossary(records, snapshot.entities, {
    currentChapterOrder: chapter.order,
    budgetTokens: GLOSSARY_TOKENS,
  });
}
