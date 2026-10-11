import { parseHTML } from 'linkedom';

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
const LEXICON_FAIL_HITS = 3;
const LINK_GOOD = 0.25;
const LINK_FAIL = 0.5;

const WEIGHTS = { length: 0.25, sentence: 0.25, repeated: 0.15, lexicon: 0.15, links: 0.2 };

export interface ScoreInput {
  blocks: readonly Block[];
  /** The page as fetched, used for raw-DOM link density. */
  rawHtml: string;
  lang: string | null;
  /** Chapters need more text than articles to pass the length check. Defaults to `article`. */
  expect?: keyof typeof LENGTH_FAIL_UNITS;
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
 * Link density of the page's main candidate, read from the raw DOM. Readability removes anchors,
 * so this has to run on the source page. The candidate is `article`, else `main`, `[role=main]`,
 * or `body`. Returns null when the candidate has no text.
 */
export function mainLinkDensity(rawHtml: string): number | null {
  const { document } = parseHTML(rawHtml);
  for (const node of Array.from(document.querySelectorAll('script, style, noscript, template'))) {
    node.remove();
  }
  const candidate =
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.querySelector('[role="main"]') ??
    document.body;

  const totalChars = (candidate.textContent ?? '').replace(/\s+/g, '').length;
  if (totalChars === 0) return null;

  let linkChars = 0;
  for (const anchor of Array.from(candidate.querySelectorAll('a'))) {
    linkChars += (anchor.textContent ?? '').replace(/\s+/g, '').length;
  }
  return Math.min(1, linkChars / totalChars);
}

/**
 * Scores one extraction from 0 to 1 using the five R3 signals: effective length, sentence-likeness,
 * repeated blocks, lexicon hits, and raw-DOM link density. Any R3 "poor" condition caps the score.
 */
export function scoreExtraction(input: ScoreInput): ScoreResult {
  const { blocks, rawHtml, lang } = input;
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

  const lexiconHits = blocks.filter(
    (block, i) => matchRule(block.text, blockUnits[i] ?? 0) !== null,
  ).length;
  const lexiconHitRate = blocks.length === 0 ? 0 : lexiconHits / blocks.length;

  const linkDensity = mainLinkDensity(rawHtml);

  const hardFails: string[] = [];
  if (blocks.length === 0) {
    hardFails.push('empty');
  } else {
    if (units < failUnits) hardFails.push('length');
    if (eligible.length > 0 && sentenceLikeness < SENTENCE_FAIL) hardFails.push('sentence');
    if (lexiconHits >= LEXICON_FAIL_HITS) hardFails.push('lexicon');
  }

  const components = {
    length: clamp01((units - failUnits) / (LENGTH_GOOD - failUnits)),
    sentence: clamp01((sentenceLikeness - SENTENCE_FAIL) / (SENTENCE_GOOD - SENTENCE_FAIL)),
    repeated: clamp01(
      repeatedBlockRatio <= REPEATED_GOOD
        ? 1
        : 1 - (repeatedBlockRatio - REPEATED_GOOD) / (REPEATED_FAIL - REPEATED_GOOD),
    ),
    lexicon: clamp01(1 - lexiconHits / LEXICON_FAIL_HITS),
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
  if (hardFails.length > 0) score = Math.min(score, HARD_FAIL_CAP);

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
