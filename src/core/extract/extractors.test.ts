import { extractWithDefuddle, extractWithReadability } from './extractors';

const URL = 'https://news.example.com/world/storm-harbour';

const ARTICLE = `<!doctype html><html lang="en"><head>
  <title>Storm hits harbour | Example News</title>
  <meta property="og:site_name" content="Example News">
  <meta name="author" content="Jane Roe">
  <meta property="article:published_time" content="2026-10-11T08:14:00Z">
  <script>var tracking = "should never appear";</script>
</head><body>
  <nav><a href="/a">Home</a> <a href="/b">Sport</a> <a href="/c">Weather</a></nav>
  <article>
    <h1>Storm hits harbour</h1>
    <p>The storm that moved up the coast overnight brought strong winds to the harbour district, and by breakfast the grid operator had confirmed that thousands of homes were without power.</p>
    <p>Crews worked through the night to clear fallen trees from the road into the port. Residents said the sea wall held, although spray reached the upper floors of several houses on the quay.</p>
    <p>Forecasters expect the wind to ease by the afternoon. Officials asked people to keep away from the seafront until the promenade has been inspected for damage.</p>
    <img src="harbour.jpg" alt="Waves over the wall">
  </article>
  <footer>Copyright 2026 Example News</footer>
</body></html>`;

describe('extractWithReadability', () => {
  it('returns the title, byline, site name, language and main-content blocks', () => {
    const article = extractWithReadability(ARTICLE, URL);
    expect(article.title).toContain('Storm hits harbour');
    expect(article.byline).toBe('Jane Roe');
    expect(article.lang).toBe('en');
    expect(article.siteName).toBe('Example News');
    expect(article.blocks.map((block) => block.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('The storm that moved up the coast'),
        expect.stringContaining('Forecasters expect the wind'),
      ]),
    );
  });

  it('drops navigation, footer and script text', () => {
    const { text } = extractWithReadability(ARTICLE, URL);
    expect(text).not.toContain('should never appear');
    expect(text).not.toContain('Copyright 2026');
  });

  it('resolves relative image URLs against the page URL', () => {
    const { contentHtml } = extractWithReadability(ARTICLE, URL);
    expect(contentHtml).toContain('https://news.example.com/world/harbour.jpg');
  });

  it('returns an empty article for a page with no readable content', () => {
    const article = extractWithReadability('<html><body></body></html>', URL);
    expect(article.blocks).toEqual([]);
    expect(article.text).toBe('');
  });
});

describe('extractWithDefuddle', () => {
  it('returns the title and the main-content blocks', async () => {
    const article = await extractWithDefuddle(ARTICLE, URL);
    expect(article.title).toContain('Storm hits harbour');
    expect(article.blocks.map((block) => block.text).join(' ')).toContain(
      'Crews worked through the night',
    );
  });

  it('reads byline, site name and publication date from page metadata', async () => {
    const article = await extractWithDefuddle(ARTICLE, URL);
    expect(article.byline).toBe('Jane Roe');
    expect(article.siteName).toBe('Example News');
    expect(article.publishedAt).toContain('2026-10-11');
  });

  it('returns no blocks for an empty document', async () => {
    const article = await extractWithDefuddle('<html><body></body></html>', URL);
    expect(article.blocks).toEqual([]);
  });
});
