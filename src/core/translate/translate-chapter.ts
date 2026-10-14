import { collectTranslations, validateAlignment } from './align';
import { buildTranslatePrompt, withRepairNote } from './prompts';
import { parseTranslateReply, TRANSLATE_JSON_SCHEMA } from './schemas';
import { addUsage, throwIfCancelled, ZERO_USAGE } from '../llm/transport';
import { planLlmChunks } from '../text/chunk';

import type { Lang } from '../domain';
import type {
  GlossaryEntry,
  PreviousSentence,
  PromptPair,
  TranslateSentence,
  TranslateUsage,
} from './types';
import type { LlmTransport, LlmUsage } from '../llm/transport';
import type { LlmChunk } from '../text/chunk';

/** Source tokens per request, as estimated by `estimateTokens`. */
export const TRANSLATE_CHUNK_TOKENS = 1500;
/** Output tokens a translation reply may use: twice a chunk, which is more than any language pair expands to. */
export const TRANSLATE_MAX_OUTPUT_TOKENS = 2 * TRANSLATE_CHUNK_TOKENS;
/** Sentences of translated context sent ahead of each chunk. */
export const TRANSLATE_CONTEXT_SENTENCES = 5;

/**
 * Splits the chapter into chunks of sentence idx ranges, both ends inclusive. A custom planner must
 * cover every sentence. A sentence it misses still gets the source text, flagged as partial.
 */
export type ChunkPlanner = (sentences: readonly TranslateSentence[]) => readonly LlmChunk[];

export interface TranslateProgress {
  /** Sentences with a result so far, including the source fallbacks. */
  readonly translated: number;
  readonly total: number;
}

export interface TranslateChapterInput {
  readonly sentences: readonly TranslateSentence[];
  readonly sourceLang: Lang;
  readonly targetLang: Lang;
  readonly glossary: readonly GlossaryEntry[];
  readonly styleNotes?: string | null;
  /** The injected transport. The engine never imports the OpenRouter client. */
  readonly llm: LlmTransport;
  /** Defaults to `planLlmChunks` at `TRANSLATE_CHUNK_TOKENS` with no overlap. */
  readonly chunker?: ChunkPlanner;
  /** Chunks in flight at once. Defaults to 1, which keeps the context strictly sequential. */
  readonly concurrency?: number;
  readonly onProgress?: (progress: TranslateProgress) => void;
  /** Checked between chunks and passed to every model call. */
  readonly signal?: AbortSignal;
}

export interface TranslateChapterResult {
  /** One entry for every input idx: the translation, or the source text when it is partial. */
  readonly translations: Map<number, string>;
  /** idx values that fell back to the source text after the repair attempt, ascending. */
  readonly partialIdx: number[];
  readonly usage: TranslateUsage;
}

/** Raised when a reply is still not valid JSON after the one repair retry. */
export class TranslateOutputError extends Error {
  readonly code = 'LLM_INVALID_OUTPUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'TranslateOutputError';
  }
}

/**
 * Translates a chapter sentence by sentence (by idx), keeping alignment. Each chunk is checked
 * against the idx values sent. Missing idx values get one repair request. Anything still missing
 * falls back to the source text and is reported in `partialIdx`. Transport errors propagate
 * unchanged for the caller to classify.
 */
export async function translateChapter(
  input: TranslateChapterInput,
): Promise<TranslateChapterResult> {
  const concurrency = input.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  }
  if (new Set(input.sentences.map((s) => s.idx)).size !== input.sentences.length) {
    throw new RangeError('sentence idx values must be unique within the chapter');
  }
  const run = new ChapterRun(input);
  await run.execute();
  return {
    translations: run.translations,
    partialIdx: run.partialIdx.sort((a, b) => a - b),
    usage: run.usage(),
  };
}

interface ChunkJob {
  readonly members: readonly TranslateSentence[];
  /** Position of the chunk's first sentence in the chapter, for the context window. */
  readonly startPos: number;
}

class ChapterRun {
  readonly translations = new Map<number, string>();
  readonly partialIdx: number[] = [];

  private readonly input: TranslateChapterInput;
  private readonly counts = { requests: 0, repairRequests: 0 };
  private spent: LlmUsage = ZERO_USAGE;

  constructor(input: TranslateChapterInput) {
    this.input = input;
  }

  usage(): TranslateUsage {
    return {
      requests: this.counts.requests,
      repairRequests: this.counts.repairRequests,
      usage: this.spent,
    };
  }

  async execute(): Promise<void> {
    const { sentences, signal, onProgress } = this.input;
    const concurrency = this.input.concurrency ?? 1;
    throwIfCancelled(signal);

    // Blank sentences are not sent to the model. They come back unchanged.
    for (const sentence of sentences) {
      if (isBlank(sentence.text)) this.translations.set(sentence.idx, sentence.text);
    }

    const jobs = this.planJobs();
    let next = 0;
    let failed = false;
    const worker = async (): Promise<void> => {
      while (!failed && next < jobs.length) {
        const job = jobs[next];
        next += 1;
        if (!job) break;
        try {
          await this.translateChunk(job.members, this.previousContext(job.startPos));
        } catch (error) {
          failed = true;
          throw error;
        }
        onProgress?.({ translated: this.translations.size, total: sentences.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

    // A custom chunker that skipped a sentence still yields a complete result.
    for (const sentence of sentences) {
      if (this.translations.has(sentence.idx)) continue;
      this.translations.set(sentence.idx, sentence.text);
      this.partialIdx.push(sentence.idx);
    }
  }

  private planJobs(): ChunkJob[] {
    const { sentences, chunker } = this.input;
    const plan = chunker ?? defaultChunker;
    const jobs: ChunkJob[] = [];
    for (const chunk of plan(sentences)) {
      const members = sentences.filter(
        (s) => s.idx >= chunk.start && s.idx <= chunk.end && !isBlank(s.text),
      );
      if (members.length === 0) continue;
      const startPos = sentences.findIndex((s) => s.idx >= chunk.start);
      jobs.push({ members, startPos });
    }
    return jobs;
  }

  private previousContext(startPos: number): PreviousSentence[] {
    const from = Math.max(0, startPos - TRANSLATE_CONTEXT_SENTENCES);
    return this.input.sentences.slice(from, startPos).map((s) => ({
      idx: s.idx,
      source: s.text,
      translation: this.translations.get(s.idx) ?? null,
    }));
  }

  private async translateChunk(
    members: readonly TranslateSentence[],
    previousContext: readonly PreviousSentence[],
  ): Promise<void> {
    const { sourceLang, targetLang, glossary, styleNotes } = this.input;
    const base = {
      sourceLang,
      targetLang,
      glossary,
      styleNotes: styleNotes ?? null,
      previousContext,
    };

    const prompt = buildTranslatePrompt({ ...base, sentences: members });
    let reply = parseTranslateReply(await this.call(prompt, false));
    if (!reply.ok) {
      const retry = withRepairNote(
        prompt,
        `Your previous reply could not be used (${reply.reason}). Reply again with only the corrected JSON object.`,
      );
      reply = parseTranslateReply(await this.call(retry, true));
      if (!reply.ok) {
        throw new TranslateOutputError(`translation reply invalid after repair: ${reply.reason}`);
      }
    }

    const expected = members.map((s) => s.idx);
    const { missing } = validateAlignment(expected, reply.items);
    const got = collectTranslations(reply.items, new Set(expected));

    if (missing.length > 0) {
      const missingSet = new Set(missing);
      const repairPrompt = withRepairNote(
        buildTranslatePrompt({
          ...base,
          sentences: members.filter((s) => missingSet.has(s.idx)),
        }),
        `Only these idx values are missing from the previous reply: ${missing.join(', ')}. Return items for exactly these idx values and nothing else.`,
      );
      const repair = parseTranslateReply(await this.call(repairPrompt, true));
      if (repair.ok) {
        for (const [idx, text] of collectTranslations(repair.items, missingSet)) {
          got.set(idx, text);
        }
      }
    }

    for (const sentence of members) {
      const text = got.get(sentence.idx);
      if (text === undefined) {
        this.translations.set(sentence.idx, sentence.text);
        this.partialIdx.push(sentence.idx);
      } else {
        this.translations.set(sentence.idx, text);
      }
    }
  }

  private async call(prompt: PromptPair, isRepair: boolean): Promise<string> {
    throwIfCancelled(this.input.signal);
    const reply = await this.input.llm({
      system: prompt.system,
      user: prompt.user,
      jsonSchema: TRANSLATE_JSON_SCHEMA,
      signal: this.input.signal,
      cacheSystem: true,
      maxOutputTokens: TRANSLATE_MAX_OUTPUT_TOKENS,
    });
    this.counts.requests += 1;
    if (isRepair) this.counts.repairRequests += 1;
    this.spent = addUsage(this.spent, reply.usage);
    return reply.text;
  }
}

function defaultChunker(sentences: readonly TranslateSentence[]): readonly LlmChunk[] {
  return planLlmChunks(sentences, { maxTokens: TRANSLATE_CHUNK_TOKENS, overlapSentences: 0 });
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}
