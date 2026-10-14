import { excerptOf, findNextChapterUrl, qualityOf } from './source-preview';

const PAGE = 'https://example.com/book/chapter-3';

describe('qualityOf', () => {
  it('maps the extraction decisions to the preview quality', () => {
    expect(qualityOf('accept', 'Some text.')).toBe('good');
    expect(qualityOf('llm_select', 'Some text.')).toBe('needs_ai');
    expect(qualityOf('webview', 'Some text.')).toBe('needs_render');
    expect(qualityOf('accept', '   ')).toBe('empty');
  });
});

describe('excerptOf', () => {
  it('cuts at 400 code points, never inside a character', () => {
    const cjk = '漢'.repeat(500);
    expect(Array.from(excerptOf(cjk))).toHaveLength(400);
    expect(excerptOf('  short  ')).toBe('short');
  });
});

describe('findNextChapterUrl', () => {
  it('prefers a rel="next" link and resolves it against the page', async () => {
    const html = `<html><head><link rel="next" href="/book/chapter-4"></head>
      <body><a href="/book/chapter-2">Previous chapter</a></body></html>`;
    expect(await findNextChapterUrl(html, PAGE)).toBe('https://example.com/book/chapter-4');
  });

  it('finds a next-chapter label in the page links', async () => {
    const html = `<a href="/c2">← Previous Chapter</a><a href="https://example.com/c4">Next Chapter →</a>`;
    expect(await findNextChapterUrl(html, PAGE)).toBe('https://example.com/c4');
  });

  it('finds next labels in other languages, and rejects previous ones', async () => {
    expect(await findNextChapterUrl('<a href="/n">下一章</a>', PAGE)).toBe('https://example.com/n');
    expect(await findNextChapterUrl('<a href="/p">上一章</a>', PAGE)).toBeNull();
    expect(await findNextChapterUrl('<a href="/n">次へ</a>', PAGE)).toBe('https://example.com/n');
  });

  it('ignores non-web links, links back to the page, and long sentences that mention "next"', async () => {
    const html = `<a href="mailto:a@b.c">Next chapter</a>
      <a href="${PAGE}">Next chapter</a>
      <a href="/long">She said that the next chapter of the story would begin at dawn, when the bells rang out.</a>`;
    expect(await findNextChapterUrl(html, PAGE)).toBeNull();
  });
});
