import { runAnalysisCall } from './analysis-call';
import { MAX_CHUNK_TOKENS, MEMORY_LIMITS } from './limits';
import { mergeMemoryDrafts } from './merge-memory';
import { buildAnalysisPrompt, buildSummaryReducePrompt } from './prompts';
import { truncateWords } from './schemas';
import { chapterEraOf } from './chapter-era';
import { validateCues } from './validate-cues';
import { runOrdered } from '../async/ordered-pool';
import { addUsage, throwIfCancelled, ZERO_USAGE } from '../llm/transport';
import { planLlmChunks } from '../text/chunk';
import { normalizeWhitespace } from '../text/normalize';

import type { AnalysisCallResult } from './analysis-call';
import type { AmbienceEra } from './ambience-taxonomy';
import type { Lang, MemoryFields, SentenceInput, ValidatedCue } from './types';
import type { DroppedCue } from './validate-cues';
import type { LlmTransport, LlmUsage } from '../llm/transport';

/** Chunk calls in flight at once. Chunks are independent, so they run in parallel. */
export const ANALYSIS_CONCURRENCY = 3;

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
  /** Chunk calls in flight at once. Defaults to ANALYSIS_CONCURRENCY. */
  readonly concurrency?: number;
  /**
   * For multi-chunk chapters, rewrite the summary with one extra call (default true). When false
   * the joined chunk summaries are kept, capped.
   */
  readonly reduceSummary?: boolean;
}

export interface ChapterAnalysis {
  readonly memory: MemoryFields;
  readonly cues: ValidatedCue[];
  readonly dropped: DroppedCue[];
  readonly chunkCount: number;
  /** Usage of every model call made for this chapter, repairs and the summary reduce included. */
  readonly usage: LlmUsage;
  /** The chapter's era: the majority of its passages' eras, or null when none names one (A4). */
  readonly era: AmbienceEra | null;
}

/**
 * Runs the single analysis call per chunk, then merges the memories, runs the optional summary
 * reduce and validates the combined cues against the whole chapter. Chunks run a few at a time, and
 * their replies are kept in chunk order, because the memory merge depends on that order.
 */
export async function analyzeChapter(input: AnalyzeChapterInput): Promise<ChapterAnalysis> {
  if (input.sentences.some((s, i) => s.idx !== i)) {
    throw new RangeError('sentences must be indexed 0..n-1 in order');
  }

  const plan = input.planChunks ?? defaultChunkPlanner;
  const chunks = plan(input.sentences);

  const responses: AnalysisCallResult[] = [];
  await runOrdered(
    chunks,
    (chunk, _index, signal) =>
      runAnalysisCall(
        input.callLlm,
        buildAnalysisPrompt({
          sentences: chunk,
          seriesTitle: input.seriesTitle,
          chapterTitle: input.chapterTitle,
          priorContext: input.priorContext,
          lang: input.lang,
        }),
        signal,
      ),
    {
      concurrency: input.concurrency ?? ANALYSIS_CONCURRENCY,
      signal: input.signal,
      onResult: (response) => {
        responses.push(response);
      },
    },
  );

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

  const era = chapterEraOf(responses.map((r) => r.era));
  const { cues, dropped } = validateCues(
    responses.flatMap((r) => r.cues),
    {
      sentenceCount: input.sentences.length,
      wordCount: input.wordCount,
      sentences: input.sentences,
      chapterEra: era,
    },
  );

  return { memory, cues, dropped, chunkCount: chunks.length, usage, era };
}

/** One plain-text call. A null summary means the reply was empty, so the joined summary is kept. */
async function reduceSummary(
  callLlm: LlmTransport,
  signal: AbortSignal | undefined,
  input: { chapterTitle: string; lang: Lang; summaries: readonly string[] },
): Promise<{ summary: string | null; usage: LlmUsage }> {
  if (input.summaries.length === 0) return { summary: null, usage: ZERO_USAGE };
  const prompt = buildSummaryReducePrompt(input);
  const reply = await callLlm({ system: prompt.system, user: prompt.user, signal });
  const text = truncateWords(normalizeWhitespace(reply.text), MEMORY_LIMITS.summaryWords);
  return { summary: text || null, usage: reply.usage };
}
