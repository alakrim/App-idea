/*
 * Web-page extraction for the extract stage (ADR-0004). Fetch, extract on device, then either
 * accept the result, render the page in a hidden WebView and re-gate it, or ask the cleanup model
 * which blocks to keep. The model never rewrites text, so it cannot add content.
 */
import { z } from 'zod';

import { extractArticle, extractFromHtml } from '@/core/extract/pipeline';
import {
  applySelection,
  buildSelectionPrompt,
  parseSelectionResponse,
  selectionSchema,
} from '@/core/extract/select';
import type { Block } from '@/core/extract/types';
import type { JsonSchemaSpec } from '@/core/llm/transport';

import { StageFailure } from '../errors';

import type { StageContext } from '../context';
import type { FetchLimits } from '../ports';

/** Pages above 5 MB are refused by the fetcher. A page this size is almost never an article. */
export const FETCH_LIMITS: FetchLimits = { maxBytes: 5 * 1024 * 1024, timeoutMs: 30_000 };

export const SELECTION_JSON_SCHEMA: JsonSchemaSpec = {
  name: 'index_selection',
  schema: z.toJSONSchema(selectionSchema, { io: 'output', reused: 'inline' }),
};

export interface WebExtraction {
  readonly text: string;
  readonly title: string | null;
  readonly lang: string | null;
  /** True when the cleanup model chose the blocks. */
  readonly cleaned: boolean;
}

export async function extractWebPage(ctx: StageContext, url: string): Promise<WebExtraction> {
  const fetched = await ctx.ports.fetcher.fetch(url, ctx.signal, FETCH_LIMITS);
  let result = await extractArticle({
    bytes: fetched.bytes,
    contentType: fetched.contentType ?? undefined,
    url: fetched.finalUrl,
  });

  if (result.decision === 'webview') {
    const html = await ctx.ports.webview.render(fetched.finalUrl, ctx.signal);
    result = await extractFromHtml(html, fetched.finalUrl);
  }
  if (result.decision === 'webview' || result.best === null) {
    throw new StageFailure(
      'CONTENT_EMPTY',
      'We could not find readable text on this page. Paste the text instead.',
      { retryable: false, detail: 'webview_low_quality' },
    );
  }

  const { best } = result;
  if (result.decision === 'accept') {
    return { text: best.text, title: best.title, lang: best.lang, cleaned: false };
  }
  const blocks = await selectBlocks(ctx, best.blocks, { title: best.title, lang: best.lang });
  return {
    text: blocks.map((block) => block.text).join('\n\n'),
    title: best.title,
    lang: best.lang,
    cleaned: true,
  };
}

/**
 * Asks the cleanup model which blocks to keep. A reply that fails validation keeps every block,
 * so a bad reply can never blank a chapter. The cost of the call is recorded either way.
 */
async function selectBlocks(
  ctx: StageContext,
  blocks: readonly Block[],
  meta: { title: string | null; lang: string | null },
): Promise<readonly Block[]> {
  const model = ctx.record.settings.cleanupModel;
  const transport = ctx.meter.transport(model, ctx.ports.llm.transportFor(model));
  const prompt = buildSelectionPrompt(blocks, meta);
  const reply = await transport({
    system: prompt.system,
    user: prompt.user,
    jsonSchema: SELECTION_JSON_SCHEMA,
    signal: ctx.signal,
  });
  const selection = parseSelectionResponse(reply.text);
  if (!selection) return blocks;
  return applySelection(blocks, selection.keep).blocks;
}
