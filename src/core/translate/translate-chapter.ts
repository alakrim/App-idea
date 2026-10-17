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
/** Sentences of translated context sent ahead of each chunk. */
export const TRANSLATE_CONTEXT_SENTENCES = 5;

/**
 * Splits the sentences into chunks of sentence idx ranges, both ends inclusive. A custom planner
 * should cover every sentence it is given. A sentence it misses still gets the source text, flagged
 * as partial.
 */
export type ChunkPlanner = (sentences: readonly TranslateSentence[]) => readonly LlmChunk[];

export interface TranslateProgress {
  /** Sentences with a final result so far, including the source fallbacks and the prefilled ones. */
  readonly translated: number;
  readonly total: number;
}

/** The results of one chunk, committed together. */
export interface TranslateCommit {
  /** Every sentence of the chunk, with its final text. Partial sentences hold the source text. */
  readonly translations: ReadonlyMap<number, string>;
  /** The sentences of this commit that fell back to the source text, ascending. */
  readonly partialIdx: readonly number[];
}

export interface TranslateChapterInput {
  /** Every sentence of the chapter, in reading order. */
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
  /**
   * Called with each chunk's results once they are final, strictly in reading order, even when the
   * chunks finished out of order. Awaited, so a slow write holds back the next commit.
   */
  readonly onCommit?: (commit: TranslateCommit) => Promise<void> | void;
  /** Sentences that are already final (from an earlier call or a resumed run). They are not sent, but they give context. */
  readonly translated?: ReadonlyMap<number, string>;
  /** Only the sentences whose idx is in this inclusive range are translated. Defaults to all of them. */
  readonly range?: { readonly fromIdx: number; readonly toIdx: number };
  /** Checked between chunks and passed to every model call. */
  readonly signal?: AbortSignal;
}

export interface TranslateChapterResult {
  /** Every final translation, prefilled ones included. Partial sentences hold the source text. */
  readonly translations: Map<number, string>;
  /** idx values of this call that fell back to the source text after the repair attempt, ascending. */
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
 * Translates the sentences of a range by idx, keeping alignment. Each chunk is checked against the
 * idx values sent. Missing idx values get one repair request. Anything still missing falls back to
 * the source text and is reported in `partialIdx`. Transport errors propagate unchanged for the
 * caller to classify.
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
  /** The sentences of the chunk that are still to be translated, blanks included. */
  readonly candidates: readonly TranslateSentence[];
  /** Position of the chunk's first sentence in the chapter, for the context window. */
  readonly startPos: number;
}

/** Hands out commits in job order, whatever order the jobs finish in. */
class OrderedCommits {
  private readonly ready = new Map<number, TranslateCommit>();
  private next = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly apply: (commit: TranslateCommit) => Promise<void> | void) {}

  /** Resolves once every commit up to and including this one has been applied. */
  offer(index: number, commit: TranslateCommit): Promise<void> {
    this.ready.set(index, commit);
    this.chain = this.chain.then(() => this.drain());
    return this.chain;
  }

  private async drain(): Promise<void> {
    for (let commit = this.ready.get(this.next); commit; commit = this.ready.get(this.next)) {
      this.ready.delete(this.next);
      this.next += 1;
      await this.apply(commit);
    }
  }
}

class ChapterRun {
  readonly translations = new Map<number, string>();
  readonly partialIdx: number[] = [];

  private readonly input: TranslateChapterInput;
  private readonly counts = { requests: 0, repairRequests: 0 };
  private spent: LlmUsage = ZERO_USAGE;

  constructor(input: TranslateChapterInput) {
    this.input = input;
    for (const [idx, text] of input.translated ?? []) this.translations.set(idx, text);
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

    const candidates = this.candidates();
    const jobs = this.planJobs(candidates);
    const commits = new OrderedCommits((commit) => this.apply(commit));
    let next = 0;
    let failed = false;
    const worker = async (): Promise<void> => {
      while (!failed && next < jobs.length) {
        const index = next;
        const job = jobs[index];
        next += 1;
        if (!job) break;
        try {
          const commit = await this.translateJob(job);
          await commits.offer(index, commit);
        } catch (error) {
          failed = true;
          throw error;
        }
        onProgress?.({ translated: this.translations.size, total: sentences.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

    // A custom chunker that skipped a sentence still yields a complete result.
    const leftover = candidates.filter((s) => !this.translations.has(s.idx));
    if (leftover.length > 0) {
      await commits.offer(jobs.length, this.fallbackCommit(leftover));
      onProgress?.({ translated: this.translations.size, total: sentences.length });
    }
  }

  /** Sentences in range that have no final text yet, in reading order. */
  private candidates(): TranslateSentence[] {
    const range = this.input.range ?? { fromIdx: -Infinity, toIdx: Infinity };
    return this.input.sentences.filter(
      (s) => s.idx >= range.fromIdx && s.idx <= range.toIdx && !this.translations.has(s.idx),
    );
  }

  private planJobs(candidates: readonly TranslateSentence[]): ChunkJob[] {
    const plan = this.input.chunker ?? defaultChunker;
    const assigned = new Set<number>();
    const jobs: ChunkJob[] = [];
    for (const chunk of plan(candidates)) {
      const inside = candidates.filter(
        (s) => s.idx >= chunk.start && s.idx <= chunk.end && !assigned.has(s.idx),
      );
      if (inside.length === 0) continue;
      for (const s of inside) assigned.add(s.idx);
      const startPos = this.input.sentences.findIndex((s) => s.idx >= chunk.start);
      jobs.push({ candidates: inside, startPos });
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

  /** Translates one chunk. Blank sentences come back unchanged and are never sent. */
  private async translateJob(job: ChunkJob): Promise<TranslateCommit> {
    const members = job.candidates.filter((s) => !isBlank(s.text));
    if (members.length === 0) return this.blankCommit(job.candidates);
    const translated = await this.translateMembers(members, this.previousContext(job.startPos));
    const translations = new Map<number, string>();
    const partialIdx: number[] = [];
    for (const sentence of job.candidates) {
      if (isBlank(sentence.text)) {
        translations.set(sentence.idx, sentence.text);
        continue;
      }
      const text = translated.get(sentence.idx);
      if (text === undefined) {
        translations.set(sentence.idx, sentence.text);
        partialIdx.push(sentence.idx);
      } else {
        translations.set(sentence.idx, text);
      }
    }
    return { translations, partialIdx };
  }

  private async translateMembers(
    members: readonly TranslateSentence[],
    previousContext: readonly PreviousSentence[],
  ): Promise<Map<number, string>> {
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
    return got;
  }

  private async call(prompt: PromptPair, isRepair: boolean): Promise<string> {
    throwIfCancelled(this.input.signal);
    const reply = await this.input.llm({
      system: prompt.system,
      user: prompt.user,
      jsonSchema: TRANSLATE_JSON_SCHEMA,
      signal: this.input.signal,
      cacheSystem: true,
    });
    this.counts.requests += 1;
    if (isRepair) this.counts.repairRequests += 1;
    this.spent = addUsage(this.spent, reply.usage);
    return reply.text;
  }

  /** Records a commit: sets the final text of its sentences and reports it to the caller. */
  private async apply(commit: TranslateCommit): Promise<void> {
    for (const [idx, text] of commit.translations) this.translations.set(idx, text);
    this.partialIdx.push(...commit.partialIdx);
    await this.input.onCommit?.(commit);
  }

  private blankCommit(sentences: readonly TranslateSentence[]): TranslateCommit {
    return {
      translations: new Map(sentences.map((s) => [s.idx, s.text] as const)),
      partialIdx: [],
    };
  }

  private fallbackCommit(sentences: readonly TranslateSentence[]): TranslateCommit {
    const translations = new Map<number, string>();
    const partialIdx: number[] = [];
    for (const sentence of sentences) {
      translations.set(sentence.idx, sentence.text);
      if (!isBlank(sentence.text)) partialIdx.push(sentence.idx);
    }
    return { translations, partialIdx };
  }
}

function defaultChunker(sentences: readonly TranslateSentence[]): readonly LlmChunk[] {
  return planLlmChunks(sentences, { maxTokens: TRANSLATE_CHUNK_TOKENS, overlapSentences: 0 });
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}
