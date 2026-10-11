import { mergeShortFragments, repairNativeFragments, splitLongSentence } from './fragments';
import { detectScript, normalizeWhitespace } from './normalize';
import { splitByRules } from './rule-split';

/** Constructor shape of `Intl.Segmenter`, reduced to what the engine uses. */
export interface SentenceSegmenterCtor {
  new (
    locales?: string,
    options?: { granularity: 'sentence' },
  ): { segment(input: string): Iterable<{ segment: string }> };
}

export interface SegmentOptions {
  /**
   * Native segmenter to use. Omit it to detect `Intl.Segmenter` at runtime; pass `null` to force
   * the rule-based splitter; pass a constructor to inject one (used by tests).
   */
  segmenter?: SentenceSegmenterCtor | null;
}

/** The `Intl.Segmenter` constructor when the runtime provides one, otherwise null. */
export function resolveIntlSegmenter(intl: unknown = globalThis.Intl): SentenceSegmenterCtor | null {
  const candidate = (intl as { Segmenter?: unknown } | undefined)?.Segmenter;
  return typeof candidate === 'function' ? (candidate as SentenceSegmenterCtor) : null;
}

/**
 * Splits one paragraph into sentences.
 *
 * Uses `Intl.Segmenter` when it is available and the paragraph is not CJK (ICU over-splits some
 * CJK dialogue), with the rule-based splitter applied on top. Otherwise uses the rule-based splitter
 * alone. Both paths then merge fragments that are too short to stand alone and split sentences
 * longer than 400 characters.
 */
export function segmentSentences(
  paragraph: string,
  lang?: string,
  options: SegmentOptions = {},
): string[] {
  const text = normalizeWhitespace(paragraph);
  if (text === '') return [];

  const ctor = options.segmenter === undefined ? resolveIntlSegmenter() : options.segmenter;
  const native = ctor !== null && detectScript(text) !== 'cjk' ? nativeSplit(text, lang, ctor) : null;
  // Native output is refined with the rule splitter, so dialogue dashes and other breaks that ICU
  // keeps together are still split. Abbreviation repair runs first to undo ICU's over-splits.
  const pieces =
    native === null ? splitByRules(text) : repairNativeFragments(native).flatMap(splitByRules);
  return mergeShortFragments(pieces).flatMap((sentence) => splitLongSentence(sentence));
}

/** Native segmentation, or null when the segmenter rejects the locale or input. */
function nativeSplit(
  text: string,
  lang: string | undefined,
  ctor: SentenceSegmenterCtor | null,
): string[] | null {
  if (ctor === null) return null;
  try {
    const segmenter = new ctor(lang, { granularity: 'sentence' });
    const parts = Array.from(segmenter.segment(text), (part) => part.segment.trim());
    return parts.filter((part) => part !== '');
  } catch {
    return null;
  }
}
