import { Readability } from '@mozilla/readability';
import { Defuddle } from 'defuddle/node';

import { htmlToBlocks } from './blocks';
import { parseDocument } from './dom';

import type { ExtractedArticle } from './types';

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toArticle(parts: {
  title?: string | null;
  byline?: string | null;
  lang?: string | null;
  siteName?: string | null;
  publishedAt?: string | null;
  contentHtml?: string | null;
}): ExtractedArticle {
  const contentHtml = parts.contentHtml ?? '';
  const blocks = htmlToBlocks(contentHtml);
  return {
    title: nonEmpty(parts.title),
    byline: nonEmpty(parts.byline),
    lang: nonEmpty(parts.lang),
    siteName: nonEmpty(parts.siteName),
    publishedAt: nonEmpty(parts.publishedAt),
    contentHtml,
    text: blocks.map((block) => block.text).join('\n\n'),
    blocks,
  };
}

/** Runs Mozilla Readability over linkedom. An unreadable page yields an empty article, not an error. */
export function extractWithReadability(html: string, url: string): ExtractedArticle {
  const document = parseDocument(html, url);
  const article = new Readability(document, {}).parse();
  if (!article) return toArticle({});
  return toArticle({
    title: article.title,
    byline: article.byline,
    lang: article.lang,
    siteName: article.siteName,
    publishedAt: article.publishedTime,
    contentHtml: article.content,
  });
}

/**
 * Runs Defuddle over linkedom. `defuddle/node` has only an `import` export condition, so the
 * Jest `core` project maps it to the CJS build (see jest.config.js).
 */
export async function extractWithDefuddle(html: string, url: string): Promise<ExtractedArticle> {
  const document = parseDocument(html, url);
  const result = await Defuddle(document, url);
  return toArticle({
    title: result.title,
    byline: result.author,
    lang: result.language,
    siteName: result.site,
    publishedAt: result.published,
    contentHtml: result.content,
  });
}
