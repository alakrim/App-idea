import { matchRule } from './lexicon';
import { endsSentence, measureUnits, shapeKey } from './text-metrics';

import type { Block, Decision, QualitySignals } from './types';

/** Score at or above which the extraction is accepted as is (ADR-0004). */
export const ACCEPT = 0.8;
/** Score below which the page goes to a hidden WebView render (ADR-0004). */
export const WEBVIEW_BELOW = 0.55;

/** Scores are capped below WEBVIEW_BELOW when an R3 "poor" condition holds. */
const HARD_FAIL_CAP = 0.5;

const SENTENCE_MIN_UNITS = 20;
const SENTENCE_GOOD = 0.8;
const SENTENCE_FAIL = 0.5;
const LENGTH_GOOD = 400;
const LENGTH_FAIL_UNITS = { article: 150, chapter: 300 } as const;
const REPEATED_GOOD = 0.1;
const REPEATED_FAIL = 0.3;
/**
 * Share of blocks that may match the lexicon before the lexicon component starts to cost points.
 * A few navigation or share lines are normal on a real page. Above the zero share, the component is 0.
 */
const LEXICON_TOLERATED_SHARE = 0.25;
const LEXICON_ZERO_SHARE = 0.75;
const LINK_GOOD = 0.25;
const LINK_FAIL = 0.5;

/** The lexicon signal is informational: a light weight, and it never gates on its own. */
const LEXICON_WEIGHT = 0.05;
const BASE_WEIGHTS = { length: 0.25, sentence: 0.25, repeated: 0.15, links: 0.2 };
const BASE_WEIGHT_SUM = Object.values(BASE_WEIGHTS).reduce((sum, w) => sum + w, 0);
/** The other weights are scaled so that all five sum to 1. */
const REBALANCE = (1 - LEXICON_WEIGHT) / BASE_WEIGHT_SUM;
const WEIGHTS = {
  length: BASE_WEIGHTS.length * REBALANCE,
  sentence: BASE_WEIGHTS.sentence * REBALANCE,
  repeated: BASE_WEIGHTS.repeated * REBALANCE,
  links: BASE_WEIGHTS.links * REBALANCE,
  lexicon: LEXICON_WEIGHT,
};

export interface ScoreInput {
  blocks: readonly Block[];
  /** The page's main-candidate link density from `mainLinkDensity`, or null when it has no text. */
  linkDensity: number | null;
  lang: string | null;
  /** Chapters need more text than articles to pass the length check. Defaults to `article`. */
  expect?: keyof typeof LENGTH_FAIL_UNITS;
  /**
   * The blocks before post-filtering. The lexicon signal is read here, because the post-filter
   * removes the very lines that the lexicon matches. Defaults to `blocks`.
   */
  preFilterBlocks?: readonly Block[];
}

export interface ScoreResult {
  score: number;
  signals: QualitySignals;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Scores one extraction from 0 to 1 using the five R3 signals: effective length, sentence-likeness,
 * repeated blocks, lexicon hits (information only, on the pre-filter blocks), and raw-DOM link
 * density. Any R3 "poor" condition caps the score. The lexicon never caps it on its own.
 */
export function scoreExtraction(input: ScoreInput): ScoreResult {
  const { blocks, linkDensity, lang } = input;
  const lexiconBlocks = input.preFilterBlocks ?? blocks;
  const failUnits = LENGTH_FAIL_UNITS[input.expect ?? 'article'];

  const blockUnits = blocks.map((block) => measureUnits(block.text));
  const units = blockUnits.reduce((sum, value) => sum + value, 0);

  const eligible = blocks.filter((_, i) => (blockUnits[i] ?? 0) >= SENTENCE_MIN_UNITS);
  const sentenceLikeness =
    eligible.length === 0
      ? 0
      : eligible.filter((block) => endsSentence(block.text)).length / eligible.length;

  const shapeCounts = new Map<string, number>();
  for (const block of blocks) {
    const key = shapeKey(block.text);
    shapeCounts.set(key, (shapeCounts.get(key) ?? 0) + 1);
  }
  const repeated = blocks.filter((block) => (shapeCounts.get(shapeKey(block.text)) ?? 0) >= 2);
  const repeatedBlockRatio = blocks.length === 0 ? 0 : repeated.length / blocks.length;

  const lexiconUnits = lexiconBlocks.map((block) => measureUnits(block.text));
  const lexiconHits = lexiconBlocks.filter(
    (block, i) => matchRule(block.text, lexiconUnits[i] ?? 0) !== null,
  ).length;
  const lexiconHitRate = lexiconBlocks.length === 0 ? 0 : lexiconHits / lexiconBlocks.length;

  const hardFails: string[] = [];
  if (blocks.length === 0) {
    hardFails.push('empty');
  } else {
    if (units < failUnits) hardFails.push('length');
    if (eligible.length > 0 && sentenceLikeness < SENTENCE_FAIL) hardFails.push('sentence');
  }

  const components = {
    length: clamp01((units - failUnits) / (LENGTH_GOOD - failUnits)),
    sentence: clamp01((sentenceLikeness - SENTENCE_FAIL) / (SENTENCE_GOOD - SENTENCE_FAIL)),
    repeated: clamp01(
      repeatedBlockRatio <= REPEATED_GOOD
        ? 1
        : 1 - (repeatedBlockRatio - REPEATED_GOOD) / (REPEATED_FAIL - REPEATED_GOOD),
    ),
    lexicon: clamp01(
      1 -
        (lexiconHitRate - LEXICON_TOLERATED_SHARE) / (LEXICON_ZERO_SHARE - LEXICON_TOLERATED_SHARE),
    ),
    links:
      linkDensity === null || linkDensity <= LINK_GOOD
        ? 1
        : clamp01(1 - (linkDensity - LINK_GOOD) / (LINK_FAIL - LINK_GOOD)),
  };

  let score =
    WEIGHTS.length * components.length +
    WEIGHTS.sentence * components.sentence +
    WEIGHTS.repeated * components.repeated +
    WEIGHTS.lexicon * components.lexicon +
    WEIGHTS.links * components.links;
  if (blocks.length === 0) score = 0;
  else if (hardFails.length > 0) score = Math.min(score, HARD_FAIL_CAP);

  return {
    score: round(clamp01(score), 3),
    signals: {
      units: round(units, 1),
      sentenceLikeness: round(sentenceLikeness, 3),
      sentenceEligibleBlocks: eligible.length,
      repeatedBlockRatio: round(repeatedBlockRatio, 3),
      lexiconHits,
      lexiconHitRate: round(lexiconHitRate, 3),
      linkDensity: linkDensity === null ? null : round(linkDensity, 3),
      hardFails,
      components: {
        length: round(components.length, 3),
        sentence: round(components.sentence, 3),
        repeated: round(components.repeated, 3),
        lexicon: round(components.lexicon, 3),
        links: round(components.links, 3),
      },
      lang,
    },
  };
}

/** Routes a score to the next step: accept, LLM index selection, or hidden WebView. */
export function decisionForScore(score: number): Decision {
  if (score >= ACCEPT) return 'accept';
  if (score < WEBVIEW_BELOW) return 'webview';
  return 'llm_select';
}
