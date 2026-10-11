import { parseHTML } from 'linkedom';

/**
 * Parses a page with linkedom. A `<base href>` is added so relative URLs resolve against the page
 * URL, which Readability reads from the document base.
 */
export function parseDocument(html: string, url: string): Document {
  const { document } = parseHTML(html);
  const base = document.createElement('base');
  base.setAttribute('href', url);
  document.head.prepend(base);
  return document;
}
