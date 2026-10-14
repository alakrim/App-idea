import { parseDocument } from './dom';
import { mainLinkDensity } from './link-density';
import { ACCEPT, WEBVIEW_BELOW, decisionForScore, scoreExtraction } from './quality';

import type { Block } from './types';

const SUBJECTS = [
  'The harbour',
  'Local residents',
  'The rescue crew',
  'A young baker',
  'The council',
  'Old fishermen',
  'The ferry captain',
  'Each family',
  'The night nurse',
  'Our reporter',
];
const VERBS = [
  'watched',
  'carried',
  'repaired',
  'counted',
  'followed',
  'measured',
  'reported',
  'cleared',
  'guarded',
  'remembered',
];
const OBJECTS = [
  'the broken railings along the quay',
  'sandbags stacked beside the church steps',
  'the flooded cellars under the market',
  'boats tied loosely to the iron rings',
  'the lamp posts that had fallen in the wind',
  'the long queue outside the community hall',
  'generators humming beside the school gate',
  'the narrow road leading into the port',
  'the damaged roof of the old warehouse',
  'the lighthouse beam sweeping the bay',
];
const TIMES = [
  'through the long night',
  'before the morning tide',
  'while the rain kept falling',
  'until the sirens finally stopped',
  'with torches and spare batteries',
  'under a sky the colour of slate',
  'as the wind slowly eased',
  'despite the cold and the noise',
  'long after the streetlights failed',
  'once the water began to recede',
];

/** Distinct, sentence-terminated prose of roughly `count` blocks x 22 words. */
function narrativeBlocks(count: number): Block[] {
  return Array.from({ length: count }, (_, i) => {
    const text =
      `${SUBJECTS[i % 10]} ${VERBS[Math.floor(i / 10) % 10]} ${OBJECTS[(i * 3) % 10]} ${TIMES[(i * 7) % 10]}, ` +
      `and ${SUBJECTS[(i * 7 + 3) % 10]} ${VERBS[(i * 3 + 1) % 10]} ${OBJECTS[(i * 9 + 2) % 10]} ${TIMES[(i * 3 + 5) % 10]}.`;
    return { tag: 'p', text };
  });
}

const CLEAN_HTML =
  '<html><body><article><p>Clean article body with no links at all.</p></article></body></html>';
const CLEAN_LINK_DENSITY = mainLinkDensity(parseDocument(CLEAN_HTML, 'https://example.com/'));

describe('thresholds and routing', () => {
  it('exports the ADR-0004 thresholds', () => {
    expect(ACCEPT).toBe(0.8);
    expect(WEBVIEW_BELOW).toBe(0.55);
  });

  it.each([
    [1, 'accept'],
    [0.8, 'accept'],
    [0.79, 'llm_select'],
    [0.55, 'llm_select'],
    [0.549, 'webview'],
    [0, 'webview'],
  ])('routes score %s to %s', (score, decision) => {
    expect(decisionForScore(score)).toBe(decision);
  });
});

describe('scoreExtraction', () => {
  it('accepts long, clean, sentence-terminated narrative', () => {
    const blocks = narrativeBlocks(20);
    const { score, signals } = scoreExtraction({
      blocks,
      linkDensity: CLEAN_LINK_DENSITY,
      lang: 'en',
    });
    expect(signals.units).toBeGreaterThanOrEqual(400);
    expect(signals.sentenceLikeness).toBe(1);
    expect(signals.hardFails).toEqual([]);
    expect(decisionForScore(score)).toBe('accept');
    expect(score).toBeGreaterThanOrEqual(ACCEPT);
  });

  it('reports the length, sentence, repeat, lexicon and link components', () => {
    const { signals } = scoreExtraction({
      blocks: narrativeBlocks(20),
      linkDensity: CLEAN_LINK_DENSITY,
      lang: 'en',
    });
    expect(signals.components).toEqual({
      length: 1,
      sentence: 1,
      repeated: 1,
      lexicon: 1,
      links: 1,
    });
    expect(signals.sentenceEligibleBlocks).toBe(20);
    expect(signals.lang).toBe('en');
  });

  it('scores a page whose five components are all 1 as exactly 1, so the weights sum to 1', () => {
    const { score } = scoreExtraction({
      blocks: narrativeBlocks(20),
      linkDensity: CLEAN_LINK_DENSITY,
      lang: 'en',
    });
    expect(score).toBe(1);
  });

  it('scores an empty extraction as 0 with the empty hard fail', () => {
    const { score, signals } = scoreExtraction({
      blocks: [],
      linkDensity: CLEAN_LINK_DENSITY,
      lang: null,
    });
    expect(score).toBe(0);
    expect(signals.hardFails).toEqual(['empty']);
    expect(decisionForScore(score)).toBe('webview');
  });

  it('flags a short extraction as a length failure and caps its score', () => {
    const blocks: Block[] = [{ tag: 'p', text: 'A short paragraph with only a few words in it.' }];
    const { score, signals } = scoreExtraction({
      blocks,
      linkDensity: CLEAN_LINK_DENSITY,
      lang: 'en',
    });
    expect(signals.hardFails).toContain('length');
    expect(score).toBeLessThanOrEqual(0.5);
    expect(decisionForScore(score)).toBe('webview');
  });

  it('measures CJK text by character, so a 1275-character prologue passes the length check', () => {
    const blocks: Block[] = [{ tag: 'p', text: `${'夜'.repeat(1275)}。` }];
    const { signals } = scoreExtraction({ blocks, linkDensity: CLEAN_LINK_DENSITY, lang: 'ja' });
    expect(signals.units).toBe(637.5);
    expect(signals.hardFails).not.toContain('length');
  });

  it('applies the chapter length floor only when asked', () => {
    const blocks: Block[] = [{ tag: 'p', text: `${'雨'.repeat(400)}。` }];
    const article = scoreExtraction({ blocks, linkDensity: CLEAN_LINK_DENSITY, lang: 'zh' });
    const chapter = scoreExtraction({
      blocks,
      linkDensity: CLEAN_LINK_DENSITY,
      lang: 'zh',
      expect: 'chapter',
    });
    expect(article.signals.hardFails).not.toContain('length');
    expect(chapter.signals.hardFails).toContain('length');
  });

  it('counts repeated blocks and reports the share of blocks that repeat', () => {
    const blocks: Block[] = [
      ...narrativeBlocks(4),
      { tag: 'p', text: 'Advertisement' },
      { tag: 'p', text: 'Advertisement' },
    ];
    const { signals } = scoreExtraction({ blocks, linkDensity: CLEAN_LINK_DENSITY, lang: 'en' });
    expect(signals.repeatedBlockRatio).toBe(0.333);
  });

  it('reports lexicon hits as information and does not gate on them', () => {
    const blocks: Block[] = [
      ...narrativeBlocks(20),
      { tag: 'li', text: 'Related articles' },
      { tag: 'li', text: 'Leave a reply' },
      { tag: 'li', text: 'Share this on Facebook' },
    ];
    const { score, signals } = scoreExtraction({
      blocks,
      linkDensity: CLEAN_LINK_DENSITY,
      lang: 'en',
    });
    expect(signals.lexiconHits).toBe(3);
    expect(signals.hardFails).toEqual([]);
    expect(decisionForScore(score)).toBe('accept');
  });

  it('reads lexicon hits on the pre-filter blocks when they are given', () => {
    const clean = narrativeBlocks(20);
    const boilerplate: Block[] = [
      { tag: 'li', text: 'Related articles' },
      { tag: 'li', text: 'Leave a reply' },
      { tag: 'li', text: 'Share this on Facebook' },
    ];
    const { signals } = scoreExtraction({
      blocks: clean,
      preFilterBlocks: [...clean, ...boilerplate],
      linkDensity: CLEAN_LINK_DENSITY,
      lang: 'en',
    });
    expect(signals.lexiconHits).toBe(3);
    expect(signals.components.lexicon).toBe(1);
  });

  it('costs points only when boilerplate dominates the page, and never below zero', () => {
    const narrative = narrativeBlocks(10);
    const junk = (n: number): Block[] =>
      Array.from({ length: n }, () => ({ tag: 'li' as const, text: 'Leave a reply' }));
    const score = (boilerplate: number): number =>
      scoreExtraction({
        blocks: narrative,
        preFilterBlocks: [...narrative, ...junk(boilerplate)],
        linkDensity: CLEAN_LINK_DENSITY,
        lang: 'en',
      }).signals.components.lexicon ?? 0;
    expect(score(2)).toBe(1); // 2 of 12 blocks: within the tolerated share
    expect(score(10)).toBe(0.5); // 10 of 20 blocks: a half share, halfway down the ramp
    expect(score(40)).toBe(0); // 40 of 50 blocks: past the zero share
  });

  it('fails the sentence check when most long blocks lack terminal punctuation', () => {
    const blocks: Block[] = Array.from({ length: 10 }, (_, i) => ({
      tag: 'p' as const,
      text: `${SUBJECTS[i]} ${OBJECTS[i]} ${TIMES[i]} and several more words that never reach a full stop`,
    }));
    const { signals } = scoreExtraction({ blocks, linkDensity: CLEAN_LINK_DENSITY, lang: 'en' });
    expect(signals.sentenceLikeness).toBe(0);
    expect(signals.hardFails).toContain('sentence');
  });

  it('scores a link-heavy junk page below the WebView threshold', () => {
    const links = Array.from(
      { length: 30 },
      (_, i) => `<a href="/s/${i}">Story link ${i}</a>`,
    ).join('');
    const rawHtml = `<html><body><div class="directory">${links}</div></body></html>`;
    const blocks: Block[] = Array.from({ length: 30 }, (_, i) => ({
      tag: 'li' as const,
      text: `Story link ${String.fromCharCode(97 + (i % 26))}`,
    }));
    const linkDensity = mainLinkDensity(parseDocument(rawHtml, 'https://example.com/'));
    const { score, signals } = scoreExtraction({ blocks, linkDensity, lang: 'en' });
    expect(signals.linkDensity).toBe(1);
    expect(score).toBeLessThan(WEBVIEW_BELOW);
    expect(decisionForScore(score)).toBe('webview');
  });
});
