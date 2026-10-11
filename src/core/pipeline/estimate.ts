/*
 * Cost preview. Estimates what a chapter will cost before anything runs, from token heuristics and
 * the live model pricing. Every number is a heuristic, so each stage carries a range.
 *
 * Heuristics, in one place:
 * - Latin text is about 4 characters per token, CJK about 1 character per token, and other scripts
 *   about 3 (the same rule as `estimateTokens` in text/chunk).
 * - A word is 6 characters in Latin text and 1.5 characters in CJK text (text/word-count).
 * - Analysis writes about 900 tokens per chunk (ADR-0006), plus a short reduce call for long chapters.
 * - Translation output is the source tokens times a language-pair factor. CJK to Latin uses 1.6,
 *   which is conservative, since a CJK token carries more meaning and English runs longer.
 * - Narration is billed on the spoken characters. Translated text is about four characters per
 *   output token.
 */
import { MAX_CHUNK_TOKENS } from '../analysis/limits';
import { ANALYSIS_SYSTEM_PROMPT } from '../analysis/prompts';
import { estimateChatCost, estimateSpeechCost } from '../llm/cost';
import { estimateTokens } from '../text/chunk';
import { TRANSLATE_SYSTEM_PROMPT } from '../translate/prompts';
import { TRANSLATE_CHUNK_TOKENS } from '../translate/translate-chapter';

import type { Lang } from '../domain';
import type { Catalog } from './ports';

export type CostStage = 'cleanup' | 'analysis' | 'translation' | 'narration';

export interface EstimateInput {
  /** The chapter size, in words (the unit `wordCount` uses) or in characters. */
  readonly size: { readonly unit: 'words' | 'chars'; readonly count: number };
  readonly sourceLang: Lang;
  /** Null, or the same as the source language, when no translation runs. */
  readonly targetLang: Lang | null;
  readonly models: Readonly<Record<CostStage, string>>;
  readonly catalog: Pick<Catalog, 'find'>;
}

export interface StageEstimate {
  readonly stage: CostStage;
  readonly usd: number;
  readonly basis: string;
}

export interface ChapterCostEstimate {
  readonly perStage: StageEstimate[];
  readonly totalUsd: number;
  readonly low: number;
  readonly high: number;
}

/** Characters in one word of each script family (see the header comment). */
export const LATIN_CHARS_PER_WORD = 6;
export const CJK_CHARS_PER_WORD = 1.5;
/** Output tokens an analysis chunk is expected to produce (ADR-0006). */
export const ANALYSIS_OUTPUT_TOKENS_PER_CHUNK = 900;
/** Output tokens of the summary reduce call for a multi-chunk chapter. */
const REDUCE_OUTPUT_TOKENS = 200;
/** Share of the source text that the cleanup prompt sends (blocks are cut to 300 characters). */
const CLEANUP_INPUT_SHARE = 0.6;
const CLEANUP_OUTPUT_TOKENS = 200;
const CLEANUP_INSTRUCTION_TOKENS = 300;
/** Glossary budget per translation call, and the context sentences sent with it. */
const GLOSSARY_TOKENS_PER_CALL = 800;
const TRANSLATE_CONTEXT_TOKENS = 150;
/** Priors sent with each analysis call. */
const PRIOR_CONTEXT_TOKENS_PER_CALL = 1200;

/** Relative spread (plus and minus) around each estimate, by how well the stage can be predicted. */
const SPREAD: Readonly<Record<CostStage, number>> = {
  cleanup: 0.5,
  analysis: 0.3,
  translation: 0.3,
  narration: 0.1,
};

const CJK_LANGUAGES = new Set(['zh', 'ja', 'ko']);
const OTHER_SCRIPT_LANGUAGES = new Set([
  'ar',
  'bg',
  'el',
  'fa',
  'he',
  'hi',
  'ru',
  'sr',
  'th',
  'uk',
]);

type Family = 'cjk' | 'latin';

function baseLanguage(lang: Lang): string {
  return (lang.split('-')[0] ?? lang).toLowerCase();
}

function familyOf(lang: Lang): Family {
  return CJK_LANGUAGES.has(baseLanguage(lang)) ? 'cjk' : 'latin';
}

function charsPerToken(lang: Lang): number {
  const base = baseLanguage(lang);
  if (CJK_LANGUAGES.has(base)) return 1;
  return OTHER_SCRIPT_LANGUAGES.has(base) ? 3 : 4;
}

/** Output tokens per source token when translating from one family to another. */
export function translationExpansion(source: Lang, target: Lang): number {
  const from = familyOf(source);
  const to = familyOf(target);
  if (from === 'cjk' && to === 'latin') return 1.6;
  if (from === 'latin' && to === 'cjk') return 0.8;
  if (from === 'cjk') return 1;
  return 1.2;
}

export async function estimateChapterCost(input: EstimateInput): Promise<ChapterCostEstimate> {
  const sourceChars = toChars(input);
  const sourceTokens = Math.ceil(sourceChars / charsPerToken(input.sourceLang));
  const chunks = sourceChars === 0 ? 0 : Math.max(1, Math.ceil(sourceTokens / MAX_CHUNK_TOKENS));
  const target = input.targetLang ?? input.sourceLang;
  const translates = target.toLowerCase() !== input.sourceLang.toLowerCase();
  const expansion = translationExpansion(input.sourceLang, target);

  const cleanup = await chatStage(input, 'cleanup', {
    inputTokens:
      Math.ceil((sourceChars * CLEANUP_INPUT_SHARE) / charsPerToken(input.sourceLang)) +
      CLEANUP_INSTRUCTION_TOKENS,
    outputTokens: CLEANUP_OUTPUT_TOKENS,
    basis: 'upper bound: only pages that need LLM block selection',
  });

  const analysisInput =
    sourceTokens +
    chunks * (estimateTokens(ANALYSIS_SYSTEM_PROMPT) + PRIOR_CONTEXT_TOKENS_PER_CALL);
  const analysis = await chatStage(input, 'analysis', {
    inputTokens: analysisInput,
    outputTokens:
      chunks * ANALYSIS_OUTPUT_TOKENS_PER_CHUNK + (chunks > 1 ? REDUCE_OUTPUT_TOKENS : 0),
    basis: `${chunks} chunk(s) of about ${MAX_CHUNK_TOKENS} tokens, about 900 output tokens each`,
  });

  const translationTokens = translates
    ? {
        input:
          sourceTokens +
          Math.ceil(sourceTokens / TRANSLATE_CHUNK_TOKENS) *
            (estimateTokens(TRANSLATE_SYSTEM_PROMPT) +
              GLOSSARY_TOKENS_PER_CALL +
              TRANSLATE_CONTEXT_TOKENS),
        output: Math.ceil(sourceTokens * expansion),
      }
    : { input: 0, output: 0 };
  const translation = translates
    ? await chatStage(input, 'translation', {
        inputTokens: translationTokens.input,
        outputTokens: translationTokens.output,
        basis: `${baseLanguage(input.sourceLang)} to ${baseLanguage(target)}, expansion ${expansion}`,
      })
    : { stage: 'translation' as const, usd: 0, basis: 'no translation for this chapter' };

  const spokenChars = translates ? translationTokens.output * 4 : sourceChars;
  const narration = await speechStage(input, spokenChars);

  const perStage = [cleanup, analysis, translation, narration];
  const range = (estimate: StageEstimate): { low: number; high: number } => ({
    low: estimate.usd * (1 - SPREAD[estimate.stage]),
    high: estimate.usd * (1 + SPREAD[estimate.stage]),
  });
  const ranges = perStage.map(range);
  return {
    perStage: perStage.map(({ stage, usd, basis }) => ({ stage, usd, basis })),
    totalUsd: perStage.reduce((sum, e) => sum + e.usd, 0),
    low: ranges.reduce((sum, r) => sum + r.low, 0),
    high: ranges.reduce((sum, r) => sum + r.high, 0),
  };
}

function toChars(input: EstimateInput): number {
  if (input.size.unit === 'chars') return input.size.count;
  const perWord = familyOf(input.sourceLang) === 'cjk' ? CJK_CHARS_PER_WORD : LATIN_CHARS_PER_WORD;
  return Math.round(input.size.count * perWord);
}

async function chatStage(
  input: EstimateInput,
  stage: Exclude<CostStage, 'narration'>,
  tokens: { inputTokens: number; outputTokens: number; basis: string },
): Promise<StageEstimate> {
  const model = await input.catalog.find(input.models[stage]);
  if (!model) {
    return { stage, usd: 0, basis: `pricing unavailable for ${input.models[stage]}` };
  }
  return {
    stage,
    usd: estimateChatCost(model, tokens.inputTokens, tokens.outputTokens),
    basis: `${tokens.inputTokens} input and ${tokens.outputTokens} output tokens; ${tokens.basis}`,
  };
}

async function speechStage(input: EstimateInput, chars: number): Promise<StageEstimate> {
  const model = await input.catalog.find(input.models.narration);
  if (!model) {
    return {
      stage: 'narration',
      usd: 0,
      basis: `pricing unavailable for ${input.models.narration}`,
    };
  }
  return {
    stage: 'narration',
    usd: estimateSpeechCost(model, chars),
    basis: `${Math.round(chars)} spoken characters`,
  };
}
