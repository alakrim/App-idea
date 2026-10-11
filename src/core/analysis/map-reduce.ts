import { runAnalysisCall } from './analysis-call';
import { MAX_CHUNK_TOKENS, MEMORY_LIMITS } from './limits';
import { mergeMemoryDrafts } from './merge-memory';
import { buildAnalysisPrompt, buildSummaryReducePrompt } from './prompts';
import { truncateWords } from './schemas';
import { validateCues } from './validate-cues';
import { planLlmChunks } from '../text/chunk';
import { normalizeWhitespace } from '../text/normalize';

import type { AnalysisResponse } from './analysis-call';
import type { LlmTransport } from './llm';
import type { Lang, MemoryFields, SentenceInput, ValidatedCue } from './types';
import type { DroppedCue } from './validate-cues';

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
  readonly planChunks?: ChunkPlanner;
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
}

/**
 * Runs the single analysis call per chunk, then merges the memories, runs the optional summary
 * reduce and validates the combined cues against the whole chapter. Chunks run one after another.
 */
export async function analyzeChapter(input: AnalyzeChapterInput): Promise<ChapterAnalysis> {
  if (input.sentences.some((s, i) => s.idx !== i)) {
    throw new RangeError('sentences must be indexed 0..n-1 in order');
  }

  const plan = input.planChunks ?? defaultChunkPlanner;
  const chunks = plan(input.sentences);

  const responses: AnalysisResponse[] = [];
  for (const chunk of chunks) {
    responses.push(
      await runAnalysisCall(
        input.callLlm,
        buildAnalysisPrompt({
          sentences: chunk,
          seriesTitle: input.seriesTitle,
          chapterTitle: input.chapterTitle,
          priorContext: input.priorContext,
          lang: input.lang,
        }),
      ),
    );
  }

  const merged = mergeMemoryDrafts(responses.map((r) => r.memory));
  let memory: MemoryFields = merged;
  if (responses.length > 1 && (input.reduceSummary ?? true)) {
    const reduced = await reduceSummary(input.callLlm, {
      chapterTitle: input.chapterTitle,
      lang: input.lang,
      summaries: responses.map((r) => r.memory.summary).filter((s) => s !== ''),
    });
    if (reduced) memory = { ...merged, summary: reduced };
  }

  const { cues, dropped } = validateCues(
    responses.flatMap((r) => r.cues),
    {
      sentenceCount: input.sentences.length,
      wordCount: input.wordCount,
      sentences: input.sentences,
    },
  );

  return { memory, cues, dropped, chunkCount: chunks.length };
}

/** One plain-text call. Returns null when the reply is empty, so the joined summary is kept. */
async function reduceSummary(
  callLlm: LlmTransport,
  input: { chapterTitle: string; lang: Lang; summaries: readonly string[] },
): Promise<string | null> {
  if (input.summaries.length === 0) return null;
  const reply = await callLlm(buildSummaryReducePrompt(input));
  const text = truncateWords(normalizeWhitespace(reply), MEMORY_LIMITS.summaryWords);
  return text || null;
}
