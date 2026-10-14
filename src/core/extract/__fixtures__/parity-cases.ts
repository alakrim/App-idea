/** Every extraction fixture, with the content type and URL it is extracted under. */
export interface ParityCase {
  readonly file: string;
  readonly contentType: string;
  readonly url: string;
}

export const PARITY_CASES: readonly ParityCase[] = [
  {
    file: 'news-article.html',
    contentType: 'text/html; charset=utf-8',
    url: 'https://coastalcourier.example/weather/harbour-storm',
  },
  {
    file: 'blog-cookie.html',
    contentType: 'text/html; charset=utf-8',
    url: 'https://kitchen.example/notes/slow-cooking',
  },
  {
    file: 'cn-novel-chapter.html',
    contentType: 'text/html; charset=utf-8',
    url: 'https://xingherd.example/book/88231/3.html',
  },
  {
    file: 'jp-novel.html',
    contentType: 'text/html; charset=utf-8',
    url: 'https://tsukiyo.example/n1234/1/',
  },
  {
    file: 'junk-links.html',
    contentType: 'text/html; charset=utf-8',
    url: 'https://links.example/',
  },
  { file: 'spa-shell.html', contentType: 'text/html; charset=utf-8', url: 'https://app.example/' },
];
