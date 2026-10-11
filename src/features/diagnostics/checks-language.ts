import type { ProbeOutcome } from './probe';

/** Sample sentences and how many sentences each one holds. */
export const SENTENCE_SAMPLES = [
  { lang: 'en', text: 'Hello there. How are you?', sentences: 2 },
  { lang: 'zh', text: '你好。我很好。', sentences: 2 },
  { lang: 'ja', text: 'こんにちは。元気です。', sentences: 2 },
] as const;

/** Known byte samples for the legacy encodings, each with the text it must decode to. */
export const DECODE_SAMPLES = [
  { encoding: 'gbk', bytes: [0xd6, 0xd0, 0xce, 0xc4], text: '中文' },
  { encoding: 'big5', bytes: [0xa4, 0xa4, 0xa4, 0xe5], text: '中文' },
  { encoding: 'shift_jis', bytes: [0x93, 0xfa, 0x96, 0x7b], text: '日本' },
  { encoding: 'euc-kr', bytes: [0xc7, 0xd1, 0xb1, 0xb9], text: '한국' },
] as const;

type SegmenterCtor = new (
  locale: string,
  options: { granularity: 'sentence' },
) => { segment(text: string): Iterable<{ segment: string }> };

type DecoderCtor = new (label: string) => { decode(bytes: Uint8Array): string };

/** The engine globals the checks read. Injected, so tests can stand in for a missing one. */
export interface LanguageEnv {
  Segmenter?: SegmenterCtor;
  TextDecoder?: DecoderCtor;
}

/** The global engine objects, as the running JavaScript engine has them. */
export function globalLanguageEnv(): LanguageEnv {
  const intl = Intl as unknown as { Segmenter?: SegmenterCtor };
  return {
    Segmenter: intl.Segmenter,
    TextDecoder: (globalThis as { TextDecoder?: DecoderCtor }).TextDecoder,
  };
}

/** Intl.Segmenter exists and splits en, zh and ja sentences into the expected counts. */
export function checkSentenceSegmentation(env: LanguageEnv): ProbeOutcome {
  if (env.Segmenter === undefined) {
    return { status: 'fail', values: {}, message: 'Intl.Segmenter is not available.' };
  }
  const Segmenter = env.Segmenter;
  const splits: Record<string, number> = {};
  const failures: string[] = [];
  for (const sample of SENTENCE_SAMPLES) {
    const segmenter = new Segmenter(sample.lang, { granularity: 'sentence' });
    const count = [...segmenter.segment(sample.text)].filter(
      (part) => part.segment.trim() !== '',
    ).length;
    splits[sample.lang] = count;
    if (count !== sample.sentences) failures.push(`${sample.lang}: ${count}`);
  }
  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    values: { available: true, sentenceCounts: splits },
    message:
      failures.length === 0 ? undefined : `Unexpected sentence counts: ${failures.join(', ')}.`,
  };
}

/** TextDecoder decodes each legacy encoding from its known bytes. One failure does not hide the rest. */
export function checkLegacyDecoders(env: LanguageEnv): ProbeOutcome {
  if (env.TextDecoder === undefined) {
    return { status: 'fail', values: {}, message: 'TextDecoder is not available.' };
  }
  const Decoder = env.TextDecoder;
  const results: Record<string, string> = {};
  for (const sample of DECODE_SAMPLES) {
    try {
      const decoded = new Decoder(sample.encoding).decode(new Uint8Array(sample.bytes));
      results[sample.encoding] = decoded === sample.text ? 'pass' : `got "${decoded}"`;
    } catch (error) {
      results[sample.encoding] = error instanceof Error ? error.message : String(error);
    }
  }
  const failed = Object.entries(results).filter(([, value]) => value !== 'pass');
  return {
    status: failed.length === 0 ? 'pass' : 'fail',
    values: { decoders: results },
    message:
      failed.length === 0 ? undefined : `Not decoded: ${failed.map(([name]) => name).join(', ')}.`,
  };
}

/**
 * Lookbehind and \p{L}, built from strings so an engine without them fails the probe instead of
 * failing to load this module.
 */
export function checkRegexFeatures(): ProbeOutcome {
  const checks: Record<string, boolean> = {};
  const attempts: [string, string, string, string][] = [
    ['lookbehind', '(?<=\\$)\\d+', 'cost $42', '42'],
    ['unicodeLetters', '\\p{L}+', '123 héllo', 'héllo'],
  ];
  for (const [name, pattern, input, expected] of attempts) {
    try {
      const flags = name === 'unicodeLetters' ? 'u' : '';
      checks[name] = new RegExp(pattern, flags).exec(input)?.[0] === expected;
    } catch {
      checks[name] = false;
    }
  }
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return {
    status: failed.length === 0 ? 'pass' : 'fail',
    values: checks,
    message: failed.length === 0 ? undefined : `Not supported: ${failed.join(', ')}.`,
  };
}
