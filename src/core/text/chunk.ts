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
<<<<<<< HEAD
  /**
   * Speech-time caps for the first segments, in estimated seconds, in order. Segment `i` closes before
   * it would exceed `rampSeconds[i]`. Segments past the ramp are bounded by `maxChars` alone. Defaults
   * to no ramp.
   */
  rampSeconds?: readonly number[];
=======
  /** Longest segment in estimated speech seconds. Defaults to DEFAULT_TTS_MAX_SECONDS. */
  maxSeconds?: number;
  /**
   * Longest first text segment in estimated speech seconds, so playback starts quickly. Defaults to
   * DEFAULT_TTS_FIRST_MAX_SECONDS.
   */
  firstMaxSeconds?: number;
>>>>>>> 54b3d2e
}

export interface LlmPlanOptions {
  maxTokens: number;
  overlapSentences: number;
}

<<<<<<< HEAD
/** A sentence as the TTS planner sees it. `speechSeconds` is its estimated narration time. */
export type TtsPlanInput = Pick<Sentence, 'idx' | 'paragraphIdx' | 'kind' | 'charCount'> & {
  readonly speechSeconds: number;
=======
/** A sentence as the TTS planner sees it. `seconds` is its estimated speech time, zero when unknown. */
export type TtsPlanInput = Pick<Sentence, 'idx' | 'paragraphIdx' | 'kind' | 'charCount'> & {
  readonly seconds?: number;
>>>>>>> 54b3d2e
};

/** Longest narration segment in characters, when the narrator does not ask for another size. */
export const DEFAULT_TTS_MAX_CHARS = 600;
/** Longest narration segment in speech seconds, when the narrator does not ask for another size. */
export const DEFAULT_TTS_MAX_SECONDS = 40;
/** Longest first text segment in speech seconds. Short, so the first audio arrives quickly. */
export const DEFAULT_TTS_FIRST_MAX_SECONDS = 12;
const DEFAULT_MIN_CHARS = 120;
/** Absorbs floating-point error in the sums of per-character seconds. */
const SECONDS_TOLERANCE = 1e-6;

/**
 * The opening segment lengths of a chapter, in estimated seconds of speech (ADR-0008). The first
 * segment is about 12 s, so first audio arrives quickly in any script: 12 s is about 30 Han characters
 * or about 110 Latin ones. The second is about 25 s. Then the narrator's own size applies.
 */
export const NARRATION_RAMP_SECONDS: readonly number[] = [12, 25];

interface OpenSegment {
  start: number;
  end: number;
  chars: number;
  seconds: number;
  paragraphIdx: number;
}

/**
 * Groups sentences into TTS segments.
 *
<<<<<<< HEAD
 * Greedy within a paragraph, up to the segment's caps: `maxChars`, and for the opening segments also
 * the `rampSeconds` cap. A segment never crosses a paragraph, except that a paragraph shorter than
 * `minChars` may continue into a following text paragraph. Headings get a segment of their own, and so
 * does any single sentence longer than `maxChars`. A sentence longer than a ramp cap still forms a
 * segment, because a segment always holds at least one sentence.
 *
 * Prefix stable: the segments that a prefix of the sentences closes are the same as in the full plan,
 * because a decision only looks at sentences up to the one that closes the segment.
=======
 * Greedy within a paragraph, up to `maxChars` characters and `maxSeconds` of speech. The first text
 * segment of the chapter is held to `firstMaxSeconds`. A segment never crosses a paragraph, except
 * that a paragraph shorter than `minChars` may continue into a following text paragraph. Headings
 * get a segment of their own, and so does any single sentence over a limit.
>>>>>>> 54b3d2e
 */
export function planTtsSegments(
  sentences: readonly TtsPlanInput[],
  options: TtsPlanOptions = {},
): TtsSegment[] {
  const maxChars = options.maxChars ?? DEFAULT_TTS_MAX_CHARS;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
<<<<<<< HEAD
  const rampSeconds = options.rampSeconds ?? [];
  assertPositiveInteger('maxChars', maxChars);
  assertNonNegativeInteger('minChars', minChars);
  rampSeconds.forEach((cap, i) => assertPositiveNumber(`rampSeconds[${i}]`, cap));

  // Whether `sentence` may join `open`, given that `open` will sit at position `index`.
  const fits = (open: OpenSegment, sentence: TtsPlanInput, index: number): boolean => {
    if (open.chars + sentence.charCount > maxChars) return false;
    const cap = rampSeconds[index];
    return cap === undefined || open.seconds + sentence.speechSeconds <= cap;
  };
=======
  const maxSeconds = options.maxSeconds ?? DEFAULT_TTS_MAX_SECONDS;
  const firstMaxSeconds = options.firstMaxSeconds ?? DEFAULT_TTS_FIRST_MAX_SECONDS;
  assertPositiveInteger('maxChars', maxChars);
  assertNonNegativeInteger('minChars', minChars);
  assertPositiveNumber('maxSeconds', maxSeconds);
  assertPositiveNumber('firstMaxSeconds', firstMaxSeconds);
>>>>>>> 54b3d2e

  const paragraphChars = new Map<number, number>();
  for (const sentence of sentences) {
    const total = paragraphChars.get(sentence.paragraphIdx) ?? 0;
    paragraphChars.set(sentence.paragraphIdx, total + sentence.charCount);
  }

  const segments: TtsSegment[] = [];
  // Headings do not count as text. The first text segment has the short budget.
  let textSegments = 0;
  let open: OpenSegment | undefined;
  const secondsBudget = (): number => (textSegments === 0 ? firstMaxSeconds : maxSeconds);
  const close = (): void => {
    if (open) {
      segments.push(toSegment(open));
      textSegments += 1;
      open = undefined;
    }
  };

  for (const sentence of sentences) {
    const seconds = sentence.seconds ?? 0;
    if (sentence.kind === 'heading') {
      close();
      segments.push({ sentenceStart: sentence.idx, sentenceEnd: sentence.idx });
      continue;
    }
    // A sentence over a limit on its own gets a segment of its own. If a segment is open, it is
    // closed first, so the sentence's segment comes later and gets the full budget.
    const ownBudget = open ? maxSeconds : secondsBudget();
    if (sentence.charCount > maxChars || seconds > ownBudget + SECONDS_TOLERANCE) {
      close();
      segments.push({ sentenceStart: sentence.idx, sentenceEnd: sentence.idx });
      textSegments += 1;
      continue;
    }
    if (open && sentence.paragraphIdx !== open.paragraphIdx) {
      const previousIsTiny = (paragraphChars.get(open.paragraphIdx) ?? 0) < minChars;
      const mayContinue =
<<<<<<< HEAD
        previousIsTiny && sentence.kind === 'text' && fits(open, sentence, segments.length);
      if (!mayContinue) {
        segments.push(toSegment(open));
        open = undefined;
      }
    }
    if (open && !fits(open, sentence, segments.length)) {
      segments.push(toSegment(open));
      open = undefined;
=======
        previousIsTiny &&
        sentence.kind === 'text' &&
        fits(open, sentence.charCount, seconds, maxChars, secondsBudget());
      if (!mayContinue) close();
>>>>>>> 54b3d2e
    }
    if (open && !fits(open, sentence.charCount, seconds, maxChars, secondsBudget())) close();
    if (!open) {
      open = {
        start: sentence.idx,
        end: sentence.idx,
        chars: 0,
        seconds: 0,
        paragraphIdx: sentence.paragraphIdx,
      };
    }
    open.end = sentence.idx;
    open.chars += sentence.charCount;
<<<<<<< HEAD
    open.seconds += sentence.speechSeconds;
=======
    open.seconds += seconds;
>>>>>>> 54b3d2e
    open.paragraphIdx = sentence.paragraphIdx;
  }
  close();
  return segments;
}

/** Whether a sentence can join the open segment without passing either limit. */
function fits(
  open: OpenSegment,
  charCount: number,
  seconds: number,
  maxChars: number,
  maxSeconds: number,
): boolean {
  return (
    open.chars + charCount <= maxChars && open.seconds + seconds <= maxSeconds + SECONDS_TOLERANCE
  );
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

function assertPositiveNumber(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}
