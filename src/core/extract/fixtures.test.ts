import { readFileSync } from 'fs';
import { join } from 'path';

import { detectCharset } from './charset';
import { extractArticle } from './pipeline';

import type { Decision, ExtractResult } from './types';

const FIXTURES = join(__dirname, '__fixtures__');

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

function run(name: string, contentType: string, url: string): Promise<ExtractResult> {
  return extractArticle({ bytes: load(name), contentType, url });
}

describe('end-to-end extractArticle on fixtures', () => {
  it('accepts a news article and keeps its narrative while dropping nav, ads, comments and cookies', async () => {
    const result = await run(
      'news-article.html',
      'text/html; charset=utf-8',
      'https://coastalcourier.example/weather/harbour-storm',
    );
    expect(result.decision).toBe('accept');
    expect(result.best?.title).toContain('Harbour storm');
    const text = result.best?.text ?? '';
    expect(text).toContain('The storm that moved up the coast overnight');
    expect(text).toContain('Ruth Okonkwo, who runs a bakery near the quay');
    expect(text).toContain('Forecasters expect the wind to ease by the afternoon');
    expect(text).toContain('The regional council will meet on Monday');
    for (const junk of [
      'Share this on Facebook',
      'Advertisement',
      'Related articles',
      'Read more: Top 10 tips',
      'Leave a reply',
      'We use cookies',
      'Accept all',
      'Follow us on social media',
    ]) {
      expect(text).not.toContain(junk);
    }
  });

  it('accepts a blog post and drops the cookie banner, post pager and newsletter box', async () => {
    const result = await run(
      'blog-cookie.html',
      'text/html; charset=utf-8',
      'https://kitchen.example/notes/slow-cooking',
    );
    expect(result.decision).toBe('accept');
    const text = result.best?.text ?? '';
    expect(text).toContain('For most of my twenties I believed');
    expect(text).toContain('Patience is the only real ingredient in a good braise.');
    expect(text).toContain('Next time I want to try a white bean version');
    for (const junk of [
      'This site uses cookies',
      'Accept all',
      'Cookie settings',
      'Previous post',
      'Next post',
      'Subscribe to our newsletter',
    ]) {
      expect(text).not.toContain(junk);
    }
  });

  it('accepts a Chinese web-novel chapter with <br> paragraphs and drops nav and notes', async () => {
    // The page declares GBK but is stored as UTF-8. The HTTP header overrides the meta tag.
    const result = await run(
      'cn-novel-chapter.html',
      'text/html; charset=utf-8',
      'https://xingherd.example/book/88231/3.html',
    );
    expect(result.decision).toBe('accept');
    expect(result.charset).toBe('utf-8');
    const text = result.best?.text ?? '';
    expect(text).toContain('沈青崖把最后一盏灯吹灭的时候');
    expect(text).toContain('沈青崖把信收进袖中');
    expect(text).toContain('“青崖，”他轻轻叹了口气');
    for (const junk of ['上一章', '下一章', '返回目录', '求月票', '作者有话说']) {
      expect(text).not.toContain(junk);
    }
    const blocks = result.best?.blocks ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(10);
  });

  it('accepts a Japanese novel page and drops 目次 / 次へ navigation and the donation line', async () => {
    const result = await run(
      'jp-novel.html',
      'text/html; charset=utf-8',
      'https://tsukiyo.example/n1234/1/',
    );
    expect(result.decision).toBe('accept');
    const text = result.best?.text ?? '';
    expect(text).toContain('夜明け前の駅には、まだ誰の姿もなかった。');
    expect(text).toContain('終点の港町に着いたのは、昼を少し過ぎた頃だった。');
    expect(text).toContain('「迷ったら、これを鳴らしなさい。');
    for (const junk of ['目次', '次へ', 'ご支援いただける方はこちら']) {
      expect(text).not.toContain(junk);
    }
  });

  it('routes a link-only junk page to webview or LLM selection, never accept', async () => {
    const result = await run(
      'junk-links.html',
      'text/html; charset=utf-8',
      'https://links.example/',
    );
    expect(['webview', 'llm_select']).toContain(result.decision);
    expect(result.decision).not.toBe('accept');
  });

  it('routes an empty SPA shell to webview', async () => {
    const result = await run('spa-shell.html', 'text/html; charset=utf-8', 'https://app.example/');
    expect(result.decision).toBe<Decision>('webview');
    expect(result.best?.blocks).toEqual([]);
  });
});

describe('charset detection on fixture bytes', () => {
  it('reads the GBK declaration from the Chinese fixture when no header is given', () => {
    expect(detectCharset(load('cn-novel-chapter.html'))).toBe('gbk');
  });

  it('reads the UTF-8 charset from the Japanese fixture meta tag', () => {
    expect(detectCharset(load('jp-novel.html'))).toBe('utf-8');
  });
});
