import { runAnalysisCall } from './analysis-call';
import { ANALYSIS_SAMPLING, MAX_CHUNK_TOKENS, MEMORY_LIMITS } from './limits';
import { mergeMemoryDrafts } from './merge-memory';
import { buildAnalysisPrompt, buildSummaryReducePrompt } from './prompts';
import { truncateWords } from './schemas';
import { needsSettingFallback, runSettingFallback } from './setting-fallback';
import { validateCues } from './validate-cues';
import { addUsage, throwIfCancelled, ZERO_USAGE } from '../llm/transport';
import { planLlmChunks } from '../text/chunk';
import { normalizeWhitespace } from '../text/normalize';

import type { AnalysisCallResult } from './analysis-call';
import type { Lang, MemoryFields, SentenceInput, ValidatedCue } from './types';
import type { CueValidationContext, DroppedCue } from './validate-cues';
import type { LlmTransport, LlmUsage } from '../llm/transport';

/** Splits a chapter into LLM chunks. The engine takes the planner as an argument, so tests can script it. */
export type ChunkPlanner = (sentences: readonly SentenceInput[]) => SentenceInput[][];

/**
 * The default planner: the shared LLM chunk planner, with no overlap between chunks. Its chunk
 * ranges are sentence indices, so they are mapped back to the sentences they cover.
 */
export const defaultChunkPlanner: ChunkPlanner = (sentences) =>
  planLlmChunks(sentences, { maxTokens: MAX_CHUNK_TOKENS, overlapSentences: 0 }).map((chunk) =>
    sentences.filter((s) => s.idx >= chunk.start && s.idx <= chunk.end),
  );

export interface AnalyzeChapterInput {
  readonly seriesTitle: string;
  readonly chapterTitle: string;
  readonly lang: Lang;
  /** Compact notes of earlier chapters (buildPriorContext). */
  readonly priorContext: string;
  /** Every sentence of the chapter. `idx` must be 0..n-1 in order. */
  readonly sentences: readonly SentenceInput[];
  readonly wordCount: number;
  readonly callLlm: LlmTransport;
  /** Aborts between chunks and is passed to every model call. */
  readonly signal?: AbortSignal;
  readonly planChunks?: ChunkPlanner;
  /**
   * For multi-chunk chapters, rewrite the summary with one extra call (default true). When false
   * the joined chunk summaries are kept, capped.
   */
  readonly reduceSummary?: boolean;
  /**
   * The validated cues of this exact text, from the cue cache. When given, the model is asked for
   * memory only, these cues are used as they are, and the fallback does not run.
   */
  readonly cachedCues?: readonly ValidatedCue[];
}

export interface ChapterAnalysis {
  readonly memory: MemoryFields;
  readonly cues: ValidatedCue[];
  readonly dropped: DroppedCue[];
  readonly chunkCount: number;
  /** Usage of every model call made for this chapter, repairs, the summary reduce and the fallback included. */
  readonly usage: LlmUsage;
  /** True when the single-bed fallback made its call. */
  readonly fallbackRan: boolean;
}

/**
 * Runs the single analysis call per chunk, then merges the memories, runs the optional summary
 * reduce and validates the combined cues against the whole chapter. A chapter with no valid cue
 * gets the single-bed fallback. Chunks run one after another.
 */
export async function analyzeChapter(input: AnalyzeChapterInput): Promise<ChapterAnalysis> {
  if (input.sentences.some((s, i) => s.idx !== i)) {
    throw new RangeError('sentences must be indexed 0..n-1 in order');
  }

  const plan = input.planChunks ?? defaultChunkPlanner;
  const chunks = plan(input.sentences);
  const cuesDecided = input.cachedCues !== undefined;

  const responses: AnalysisCallResult[] = [];
  for (const chunk of chunks) {
    throwIfCancelled(input.signal);
    responses.push(
      await runAnalysisCall(
        input.callLlm,
        buildAnalysisPrompt({
          sentences: chunk,
          seriesTitle: input.seriesTitle,
          chapterTitle: input.chapterTitle,
          priorContext: input.priorContext,
          lang: input.lang,
          cuesDecided,
        }),
        input.signal,
      ),
    );
  }

  let usage = responses.reduce((sum, r) => addUsage(sum, r.usage), ZERO_USAGE);
  const merged = mergeMemoryDrafts(responses.map((r) => r.memory));
  let memory: MemoryFields = merged;
  if (responses.length > 1 && (input.reduceSummary ?? true)) {
    throwIfCancelled(input.signal);
    const reduced = await reduceSummary(input.callLlm, input.signal, {
      chapterTitle: input.chapterTitle,
      lang: input.lang,
      summaries: responses.map((r) => r.memory.summary).filter((s) => s !== ''),
    });
    usage = addUsage(usage, reduced.usage);
    if (reduced.summary) memory = { ...merged, summary: reduced.summary };
  }

  if (input.cachedCues !== undefined) {
    return {
      memory,
      cues: [...input.cachedCues],
      dropped: [],
      chunkCount: chunks.length,
      usage,
      fallbackRan: false,
    };
  }

  const context: CueValidationContext = {
    sentenceCount: input.sentences.length,
    wordCount: input.wordCount,
    sentences: input.sentences,
  };
  let { cues, dropped } = validateCues(
    responses.flatMap((r) => r.cues),
    context,
  );
  let fallbackRan = false;

  if (needsSettingFallback(cues.length, input.wordCount, input.sentences.length)) {
    throwIfCancelled(input.signal);
    const fallback = await runSettingFallback(
      input.callLlm,
      {
        chapterTitle: input.chapterTitle,
        memory,
        sentenceCount: input.sentences.length,
      },
      input.signal,
    );
    usage = addUsage(usage, fallback.usage);
    fallbackRan = true;
    if (fallback.rawCue !== null) {
      const extra = validateCues([fallback.rawCue], context);
      cues = [...cues, ...extra.cues];
      dropped = [...dropped, ...extra.dropped];
    }
  }

  return { memory, cues, dropped, chunkCount: chunks.length, usage, fallbackRan };
}

/** One plain-text call. A null summary means the reply was empty, so the joined summary is kept. */
async function reduceSummary(
  callLlm: LlmTransport,
  signal: AbortSignal | undefined,
  input: { chapterTitle: string; lang: Lang; summaries: readonly string[] },
): Promise<{ summary: string | null; usage: LlmUsage }> {
  if (input.summaries.length === 0) return { summary: null, usage: ZERO_USAGE };
  const prompt = buildSummaryReducePrompt(input);
  const reply = await callLlm({
    system: prompt.system,
    user: prompt.user,
    signal,
    ...ANALYSIS_SAMPLING,
  });
  const text = truncateWords(normalizeWhitespace(reply.text), MEMORY_LIMITS.summaryWords);
  return { summary: text || null, usage: reply.usage };
}
