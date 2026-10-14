import * as linkedom from 'linkedom';

import * as extractors from './extractors';
import { extractArticle, extractFromHtml } from './pipeline';

// Wraps the real parser so a test can count how often each HTML string is parsed.
jest.mock('linkedom', () => {
  const actual = jest.requireActual('linkedom');
  return { ...actual, parseHTML: jest.fn(actual.parseHTML) };
});

const URL = 'https://example.com/news/storm';

const SENTENCES = [
  'The storm that moved up the coast overnight brought strong winds to the harbour district.',
  'Crews worked through the night to clear fallen trees from the road into the port.',
  'Residents said the sea wall held, although spray reached the upper floors of several houses.',
  'Forecasters expect the wind to ease by the afternoon, though another band of rain is due.',
  'Officials asked people to keep away from the seafront until the promenade has been inspected.',
  'Power companies hope to restore supply to most customers by Sunday evening, engineers said.',
  'The regional council will meet on Monday to decide whether to open a relief fund for shops.',
  'The deputy mayor said the damage to the harbour would take months to repair in full.',
];

const ARTICLE_HTML = `<!doctype html><html lang="en"><head>
  <title>Storm hits harbour | Example News</title>
  <meta property="og:site_name" content="Example News">
</head><body>
  <nav><a href="/a">Home</a> <a href="/b">Sport</a> <a href="/c">Weather</a></nav>
  <article>
    <h1>Storm hits harbour</h1>
    ${SENTENCES.map((text) => `<p>${text} ${text}</p>`).join('\n')}
    <p>Share this on Facebook</p>
  </article>
  <div class="cookie-banner"><p>We use cookies to improve your experience.</p><button>Accept all</button></div>
</body></html>`;

const SPA_HTML =
  '<!doctype html><html><head><title>Reader</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('extractArticle', () => {
  it('decodes the bytes and accepts a clean article', async () => {
    const result = await extractArticle({
      bytes: bytesOf(ARTICLE_HTML),
      contentType: 'text/html; charset=utf-8',
      url: URL,
    });
    expect(result.charset).toBe('utf-8');
    expect(result.decision).toBe('accept');
    expect(result.best?.text).toContain('The storm that moved up the coast');
    expect(result.best?.text).not.toContain('Accept all');
    expect(result.warnings).toEqual([]);
  });

  it('returns webview with UNSUPPORTED_ENCODING when no decoder exists for the charset', async () => {
    const result = await extractArticle({
      bytes: bytesOf(ARTICLE_HTML),
      contentType: 'text/html; charset=x-no-such-codec',
      url: URL,
    });
    expect(result).toEqual({
      decision: 'webview',
      best: null,
      alternatives: [],
      score: 0,
      signals: null,
      charset: 'x-no-such-codec',
      warnings: ['UNSUPPORTED_ENCODING'],
    });
  });
});

describe('extractFromHtml', () => {
  it('returns the candidate with the higher score first, with the other as an alternative', async () => {
    const result = await extractFromHtml(ARTICLE_HTML, URL);
    expect(result.best).not.toBeNull();
    expect(result.alternatives).toHaveLength(1);
    expect(result.best?.score ?? 0).toBeGreaterThanOrEqual(result.alternatives[0]?.score ?? 0);
    expect(result.score).toBe(result.best?.score);
    expect(result.signals).toBe(result.best?.signals);
    expect(result.charset).toBeNull();
  });

  it('routes an empty single-page-app shell to webview', async () => {
    const result = await extractFromHtml(SPA_HTML, URL);
    expect(result.decision).toBe('webview');
    expect(result.best?.blocks).toEqual([]);
    expect(result.signals?.hardFails).toEqual(['empty']);
  });

  it('keeps going when Defuddle throws, and records the failure as a warning', async () => {
    jest.spyOn(extractors, 'extractWithDefuddle').mockRejectedValueOnce(new Error('boom'));
    const result = await extractFromHtml(ARTICLE_HTML, URL);
    expect(result.warnings).toEqual(['defuddle_failed: boom']);
    expect(result.best?.extractor).toBe('readability');
    expect(result.alternatives).toEqual([]);
    expect(result.decision).toBe('accept');
  });

  it('keeps going when Readability throws, and records the failure as a warning', async () => {
    jest.spyOn(extractors, 'extractWithReadability').mockImplementationOnce(() => {
      throw new Error('parse failed');
    });
    const result = await extractFromHtml(ARTICLE_HTML, URL);
    expect(result.warnings).toEqual(['readability_failed: parse failed']);
    expect(result.best?.extractor).toBe('defuddle');
  });

  it('returns webview with no best candidate when both extractors throw', async () => {
    jest.spyOn(extractors, 'extractWithReadability').mockImplementationOnce(() => {
      throw new Error('a');
    });
    jest.spyOn(extractors, 'extractWithDefuddle').mockRejectedValueOnce(new Error('b'));
    const result = await extractFromHtml(ARTICLE_HTML, URL);
    expect(result).toEqual({
      decision: 'webview',
      best: null,
      alternatives: [],
      score: 0,
      signals: null,
      charset: null,
      warnings: ['readability_failed: a', 'defuddle_failed: b'],
    });
  });
});

describe('one parse per page', () => {
  it('parses the page HTML once, however many extractors and measures run', async () => {
    const parse = jest.mocked(linkedom.parseHTML);
    parse.mockClear();
    const result = await extractFromHtml(ARTICLE_HTML, URL);
    expect(result.best?.extractor).toBeDefined();
    const pageParses = parse.mock.calls.filter(([html]) => html === ARTICLE_HTML);
    expect(pageParses).toHaveLength(1);
  });

  it('gives Defuddle its own copy, so Readability cannot remove what Defuddle reads', async () => {
    // Readability strips <script> from the page it parses. Defuddle must still see the source page.
    const html = ARTICLE_HTML.replace(
      '</body>',
      '<script>var marker = "copy-check";</script></body>',
    );
    const seen: string[] = [];
    const real = extractors.extractWithDefuddle;
    jest.spyOn(extractors, 'extractWithDefuddle').mockImplementationOnce((document, url) => {
      seen.push(document.body.innerHTML);
      return real(document, url);
    });
    await extractFromHtml(html, URL);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('copy-check');
  });
});
