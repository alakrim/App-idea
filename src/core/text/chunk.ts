import { countCodePoints } from './build';
import { detectScript } from './normalize';

import type { Sentence } from './build';

/** A TTS segment over sentence indices. Both ends are inclusive, as in `AudioSegment`. */
export interface TtsSegment {
  sentenceStart: number;
  sentenceEnd: number;
}

/** An LLM map-reduce chunk over sentence indices. Both ends are inclusive. */
export interface LlmChunk {
  start: number;
  end: number;
}

export interface TtsPlanOptions {
  /** Longest segment in characters (code points). Defaults to DEFAULT_TTS_MAX_CHARS. */
  maxChars?: number;
  /** Paragraphs shorter than this may be joined with a following text paragraph. Defaults to 120. */
  minChars?: number;
  /**
   * Size caps for the first segments, in order. Segment `i` is capped at `ramp[i]`, and segments past
   * the ramp use `maxChars`. Every cap is also limited by `maxChars`. Defaults to no ramp.
   */
  ramp?: readonly number[];
}

export interface LlmPlanOptions {
  maxTokens: number;
  overlapSentences: number;
}

export type TtsPlanInput = Pick<Sentence, 'idx' | 'paragraphIdx' | 'kind' | 'charCount'>;

/** Longest narration segment in characters, when the narrator does not ask for another size. */
export const DEFAULT_TTS_MAX_CHARS = 600;
const DEFAULT_MIN_CHARS = 120;

/**
 * The opening segment sizes of a chapter (ADR-0008). The first segment is short, so the first audio
 * arrives in seconds, and the second is twice as long. Then the narrator's own size applies.
 */
export const NARRATION_RAMP_CHARS: readonly number[] = [200, 400];

interface OpenSegment {
  start: number;
  end: number;
  chars: number;
  paragraphIdx: number;
}

/**
 * Groups sentences into TTS segments.
 *
 * Greedy within a paragraph, up to the segment's cap (`ramp`, then `maxChars`). A segment never
 * crosses a paragraph, except that a paragraph shorter than `minChars` may continue into a following
 * text paragraph. Headings get a segment of their own, and so does any single sentence longer than
 * `maxChars`. A sentence longer than a ramp cap still forms a segment, because a segment always holds
 * at least one sentence.
 *
 * Prefix stable: the segments that a prefix of the sentences closes are the same as in the full plan,
 * because a decision only looks at sentences up to the one that closes the segment.
 */
export function planTtsSegments(
  sentences: readonly TtsPlanInput[],
  options: TtsPlanOptions = {},
): TtsSegment[] {
  const maxChars = options.maxChars ?? DEFAULT_TTS_MAX_CHARS;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
  const ramp = options.ramp ?? [];
  assertPositiveInteger('maxChars', maxChars);
  assertNonNegativeInteger('minChars', minChars);
  ramp.forEach((cap, i) => assertPositiveInteger(`ramp[${i}]`, cap));
  // The cap of the segment that will be at position `index`.
  const capAt = (index: number): number => Math.min(ramp[index] ?? maxChars, maxChars);

  const paragraphChars = new Map<number, number>();
  for (const sentence of sentences) {
    const total = paragraphChars.get(sentence.paragraphIdx) ?? 0;
    paragraphChars.set(sentence.paragraphIdx, total + sentence.charCount);
  }

  const segments: TtsSegment[] = [];
  let open: OpenSegment | undefined;
  for (const sentence of sentences) {
    if (sentence.kind === 'heading' || sentence.charCount > maxChars) {
      if (open) segments.push(toSegment(open));
      open = undefined;
      segments.push({ sentenceStart: sentence.idx, sentenceEnd: sentence.idx });
      continue;
    }
    if (open && sentence.paragraphIdx !== open.paragraphIdx) {
      const previousIsTiny = (paragraphChars.get(open.paragraphIdx) ?? 0) < minChars;
      const mayContinue =
        previousIsTiny &&
        sentence.kind === 'text' &&
        open.chars + sentence.charCount <= capAt(segments.length);
      if (!mayContinue) {
        segments.push(toSegment(open));
        open = undefined;
      }
    }
    if (open && open.chars + sentence.charCount > capAt(segments.length)) {
      segments.push(toSegment(open));
      open = undefined;
    }
    if (!open) {
      open = {
        start: sentence.idx,
        end: sentence.idx,
        chars: 0,
        paragraphIdx: sentence.paragraphIdx,
      };
    }
    open.end = sentence.idx;
    open.chars += sentence.charCount;
    open.paragraphIdx = sentence.paragraphIdx;
  }
  if (open) segments.push(toSegment(open));
  return segments;
}

function toSegment(open: OpenSegment): TtsSegment {
  return { sentenceStart: open.start, sentenceEnd: open.end };
}

/**
 * Heuristic token count. Latin is about 4 characters per token, CJK about 1 per character and
 * other scripts about 3. It is a planning estimate, not a tokenizer.
 */
export function estimateTokens(text: string): number {
  const chars = countCodePoints(text);
  if (chars === 0) return 0;
  const script = detectScript(text);
  const charsPerToken = script === 'cjk' ? 1 : script === 'latin' ? 4 : 3;
  return Math.ceil(chars / charsPerToken);
}

/**
 * Groups sentences into map-reduce chunks of at most `maxTokens` estimated tokens. Consecutive
 * chunks share `overlapSentences` sentences. A single sentence over the budget gets its own chunk.
 */
export function planLlmChunks(
  sentences: readonly Pick<Sentence, 'idx' | 'text'>[],
  options: LlmPlanOptions,
): LlmChunk[] {
  if (!Number.isFinite(options.maxTokens) || options.maxTokens < 1) {
    throw new RangeError(`maxTokens must be at least 1, got ${options.maxTokens}`);
  }
  assertNonNegativeInteger('overlapSentences', options.overlapSentences);

  const tokens = sentences.map((sentence) => estimateTokens(sentence.text));
  const chunks: LlmChunk[] = [];
  let start = 0;
  while (start < sentences.length) {
    let end = start;
    let total = tokens[start] ?? 0;
    while (end + 1 < sentences.length && total + (tokens[end + 1] ?? 0) <= options.maxTokens) {
      end += 1;
      total += tokens[end] ?? 0;
    }
    chunks.push({
      start: sentences[start]?.idx ?? start,
      end: sentences[end]?.idx ?? end,
    });
    if (end === sentences.length - 1) break;
    start = Math.max(start + 1, end + 1 - options.overlapSentences);
  }
  return chunks;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}
