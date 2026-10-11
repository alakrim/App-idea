import { decode, detectCharset } from './charset';
import { ExtractError } from './errors';
import { extractWithDefuddle, extractWithReadability } from './extractors';
import { postfilter } from './postfilter';
import { decisionForScore, scoreExtraction } from './quality';

import type { Block, Candidate, ExtractedArticle, ExtractorName, ExtractResult } from './types';

export interface ExtractInput {
  bytes: Uint8Array;
  contentType?: string;
  url: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function blocksToText(blocks: readonly Block[]): string {
  return blocks.map((block) => block.text).join('\n\n');
}

/** Post-filters one extractor's output, then scores it. The brief order is filter, then score. */
function buildCandidate(
  extractor: ExtractorName,
  article: ExtractedArticle,
  rawHtml: string,
): Candidate {
  const { blocks, removed } = postfilter(article.blocks, {
    title: article.title,
    byline: article.byline,
  });
  const { score, signals } = scoreExtraction({
    blocks,
    rawHtml,
    lang: article.lang,
    preFilterBlocks: article.blocks,
  });
  return {
    ...article,
    extractor,
    blocks,
    text: blocksToText(blocks),
    removed,
    score,
    signals,
  };
}

/**
 * Runs both extractors on decoded HTML, post-filters and scores each result, and keeps the better
 * one. Used by the WebView path, which already holds the rendered HTML. A throwing extractor is
 * recorded in `warnings`, and the other one still runs.
 */
export async function extractFromHtml(
  html: string,
  url: string,
  options: { charset?: string | null } = {},
): Promise<ExtractResult> {
  const charset = options.charset ?? null;
  const warnings: string[] = [];
  const candidates: Candidate[] = [];

  try {
    const article = extractWithReadability(html, url);
    candidates.push(buildCandidate('readability', article, html));
  } catch (error) {
    warnings.push(`readability_failed: ${errorMessage(error)}`);
  }

  try {
    const article = await extractWithDefuddle(html, url);
    candidates.push(buildCandidate('defuddle', article, html));
  } catch (error) {
    warnings.push(`defuddle_failed: ${errorMessage(error)}`);
  }

  candidates.sort((a, b) => b.score - a.score || b.signals.units - a.signals.units);
  const [best, ...alternatives] = candidates;
  if (!best) {
    return {
      decision: 'webview',
      best: null,
      alternatives: [],
      score: 0,
      signals: null,
      charset,
      warnings,
    };
  }

  return {
    decision: decisionForScore(best.score),
    best,
    alternatives,
    score: best.score,
    signals: best.signals,
    charset,
    warnings,
  };
}

/**
 * Entry point for a fetched URL. It detects the charset, decodes the bytes, then runs
 * `extractFromHtml`. An undecodable charset returns `webview`, so the WebView renders the page
 * and the browser decodes it.
 */
export async function extractArticle(input: ExtractInput): Promise<ExtractResult> {
  const charset = detectCharset(input.bytes, input.contentType);
  let html: string;
  try {
    html = decode(input.bytes, charset);
  } catch (error) {
    if (error instanceof ExtractError) {
      return {
        decision: 'webview',
        best: null,
        alternatives: [],
        score: 0,
        signals: null,
        charset,
        warnings: [error.code],
      };
    }
    throw error;
  }
  return extractFromHtml(html, input.url, { charset });
}
