import { Readability } from '@mozilla/readability';
import Defuddle from 'defuddle';

import { htmlToBlocks } from './blocks';

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

/**
 * Runs Mozilla Readability on a parsed page. Readability rewrites the document it is given, so the
 * caller passes a document that no other extractor still needs. An unreadable page yields an empty
 * article, not an error.
 */
export function extractWithReadability(document: Document): ExtractedArticle {
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
 * Runs Defuddle on a parsed page with its browser build, which has no Node-only dependencies. Defuddle
 * rewrites the document it is given, so the caller passes its own copy. `parseAsync` is the entry
 * the Node build used, so the async extractors (such as transcripts) keep working.
 */
export async function extractWithDefuddle(
  document: Document,
  url: string,
): Promise<ExtractedArticle> {
  const result = await new Defuddle(document, { url }).parseAsync();
  return toArticle({
    title: result.title,
    byline: result.author,
    lang: result.language,
    siteName: result.site,
    publishedAt: result.published,
    contentHtml: result.content,
  });
}
