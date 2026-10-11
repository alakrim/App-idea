import {
  ACCEPT,
  WEBVIEW_BELOW,
  decisionForScore,
  mainLinkDensity,
  scoreExtraction,
} from './quality';

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
    const { score, signals } = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'en' });
    expect(signals.units).toBeGreaterThanOrEqual(400);
    expect(signals.sentenceLikeness).toBe(1);
    expect(signals.hardFails).toEqual([]);
    expect(decisionForScore(score)).toBe('accept');
    expect(score).toBeGreaterThanOrEqual(ACCEPT);
  });

  it('reports the length, sentence, repeat, lexicon and link components', () => {
    const { signals } = scoreExtraction({
      blocks: narrativeBlocks(20),
      rawHtml: CLEAN_HTML,
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

  it('scores an empty extraction as 0 with the empty hard fail', () => {
    const { score, signals } = scoreExtraction({ blocks: [], rawHtml: CLEAN_HTML, lang: null });
    expect(score).toBe(0);
    expect(signals.hardFails).toEqual(['empty']);
    expect(decisionForScore(score)).toBe('webview');
  });

  it('flags a short extraction as a length failure and caps its score', () => {
    const blocks: Block[] = [{ tag: 'p', text: 'A short paragraph with only a few words in it.' }];
    const { score, signals } = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'en' });
    expect(signals.hardFails).toContain('length');
    expect(score).toBeLessThanOrEqual(0.5);
    expect(decisionForScore(score)).toBe('webview');
  });

  it('measures CJK text by character, so a 1275-character prologue passes the length check', () => {
    const blocks: Block[] = [{ tag: 'p', text: `${'夜'.repeat(1275)}。` }];
    const { signals } = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'ja' });
    expect(signals.units).toBe(637.5);
    expect(signals.hardFails).not.toContain('length');
  });

  it('applies the chapter length floor only when asked', () => {
    const blocks: Block[] = [{ tag: 'p', text: `${'雨'.repeat(400)}。` }];
    const article = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'zh' });
    const chapter = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'zh', expect: 'chapter' });
    expect(article.signals.hardFails).not.toContain('length');
    expect(chapter.signals.hardFails).toContain('length');
  });

  it('counts repeated blocks and reports the share of blocks that repeat', () => {
    const blocks: Block[] = [
      ...narrativeBlocks(4),
      { tag: 'p', text: 'Advertisement' },
      { tag: 'p', text: 'Advertisement' },
    ];
    const { signals } = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'en' });
    expect(signals.repeatedBlockRatio).toBe(0.333);
  });

  it('fails the lexicon check at three or more boilerplate hits', () => {
    const blocks: Block[] = [
      ...narrativeBlocks(20),
      { tag: 'li', text: 'Related articles' },
      { tag: 'li', text: 'Leave a reply' },
      { tag: 'li', text: 'Share this on Facebook' },
    ];
    const { score, signals } = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'en' });
    expect(signals.lexiconHits).toBe(3);
    expect(signals.hardFails).toContain('lexicon');
    expect(decisionForScore(score)).toBe('webview');
  });

  it('fails the sentence check when most long blocks lack terminal punctuation', () => {
    const blocks: Block[] = Array.from({ length: 10 }, (_, i) => ({
      tag: 'p' as const,
      text: `${SUBJECTS[i]} ${OBJECTS[i]} ${TIMES[i]} and several more words that never reach a full stop`,
    }));
    const { signals } = scoreExtraction({ blocks, rawHtml: CLEAN_HTML, lang: 'en' });
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
    const { score, signals } = scoreExtraction({ blocks, rawHtml, lang: 'en' });
    expect(signals.linkDensity).toBe(1);
    expect(score).toBeLessThan(WEBVIEW_BELOW);
    expect(decisionForScore(score)).toBe('webview');
  });
});

describe('mainLinkDensity', () => {
  it('measures the article element when one exists', () => {
    const html =
      '<html><body><article><p>Plain prose here.</p></article><div><a href="/x">lots of link text</a></div></body></html>';
    expect(mainLinkDensity(html)).toBe(0);
  });

  it('falls back to body when there is no article or main element', () => {
    expect(
      mainLinkDensity('<html><body><div><a href="/x">only links</a></div></body></html>'),
    ).toBe(1);
  });

  it('ignores script and style text when measuring the candidate', () => {
    const html =
      '<html><body><article><a href="/x">aaaa</a><script>bbbbbbbbbbbbbbbbbbbbbb</script></article></body></html>';
    expect(mainLinkDensity(html)).toBe(1);
  });

  it('returns null for a page with no text', () => {
    expect(mainLinkDensity('<html><body></body></html>')).toBeNull();
  });
});
