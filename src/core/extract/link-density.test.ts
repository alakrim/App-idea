import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { detectCharset, decode } from './charset';
import { parseDocument } from './dom';
import { mainLinkDensity } from './link-density';

const FIXTURES = join(__dirname, '__fixtures__');
const URL = 'https://example.com/story';

/**
 * The pre-F4 measure, kept here as the oracle. It removed script, style, noscript and template nodes
 * from the tree before it measured, which the new measure gets without touching the tree.
 */
function referenceMainLinkDensity(document: Document): number | null {
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

function measure(html: string): number | null {
  return mainLinkDensity(parseDocument(html, URL));
}

describe('mainLinkDensity', () => {
  it('measures the article element when one exists', () => {
    const html =
      '<html><body><article><p>Plain prose here.</p></article><div><a href="/x">lots of link text</a></div></body></html>';
    expect(measure(html)).toBe(0);
  });

  it('falls back to body when there is no article or main element', () => {
    expect(measure('<html><body><div><a href="/x">only links</a></div></body></html>')).toBe(1);
  });

  it('ignores script and style text when measuring the candidate', () => {
    const html =
      '<html><body><article><a href="/x">aaaa</a><script>bbbbbbbbbbbbbbbbbbbbbb</script></article></body></html>';
    expect(measure(html)).toBe(1);
  });

  it('returns null for a page with no text', () => {
    expect(measure('<html><body></body></html>')).toBeNull();
  });

  it('does not change the document it measures', () => {
    const document = parseDocument(
      '<html><body><article><script>x()</script><a href="/x">link</a></article></body></html>',
      URL,
    );
    const before = document.body.innerHTML;
    mainLinkDensity(document);
    expect(document.body.innerHTML).toBe(before);
  });

  it('skips a noscript article, so the candidate falls through to main', () => {
    const html =
      '<html><body><noscript><article><a href="/x">lost link text here</a></article></noscript>' +
      '<main><p>Plain prose that is the real article.</p></main></body></html>';
    expect(measure(html)).toBe(0);
  });

  it('leaves anchors inside a template or noscript out of the link text', () => {
    const html =
      '<html><body><article><p>Some plain words here.</p>' +
      '<template><a href="/t">template link words</a></template>' +
      '<noscript><a href="/n">noscript link words</a></noscript></article></body></html>';
    expect(measure(html)).toBe(0);
  });

  it('counts nested anchors once per anchor, as the reference does', () => {
    const html =
      '<html><body><article><a href="/a">outer <a href="/b">inner</a></a> plain</article></body></html>';
    expect(measure(html)).toBe(referenceDensity(html));
  });
});

function referenceDensity(html: string): number | null {
  return referenceMainLinkDensity(parseDocument(html, URL));
}

describe('mainLinkDensity parity with the pre-F4 measure', () => {
  const EDGE_CASES: Record<string, string> = {
    'article beats main': `<html><body><main><a href="/m">main links</a></main>
      <article><p>article prose</p><a href="/a">a</a></article></body></html>`,
    'role=main on a script is not a candidate': `<html><body>
      <script role="main">scripted words scripted words</script>
      <div role="main"><a href="/r">role links</a> and prose</div></body></html>`,
    'noscript with an article inside': `<html><body><noscript><article><a href="/n">x</a></article></noscript>
      <div><p>real body text, with prose</p><a href="/b">link</a></div></body></html>`,
    'style text between links': `<html><body><article><style>.x{color:red}</style>
      <a href="/a">first link</a><style>p{}</style> words</article></body></html>`,
    'whitespace only': '<html><body><article>   \n\t </article></body></html>',
    'links only':
      '<html><body><article><a href="/1">one</a><a href="/2">two</a></article></body></html>',
    'unicode prose and links': `<html><body><article>
      <p>夜明け前の駅には、まだ誰の姿もなかった。</p><a href="/x">目次</a></article></body></html>`,
  };

  it.each(Object.entries(EDGE_CASES))('matches the reference on %s', (_name, html) => {
    expect(measure(html)).toBe(referenceDensity(html));
  });

  it.each(readdirSync(FIXTURES).filter((name) => name.endsWith('.html')))(
    'matches the reference on the fixture %s',
    (name) => {
      const bytes = new Uint8Array(readFileSync(join(FIXTURES, name)));
      const html = decode(bytes, detectCharset(bytes, 'text/html; charset=utf-8'));
      expect(measure(html)).toBe(referenceDensity(html));
    },
  );
});
