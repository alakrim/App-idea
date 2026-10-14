/*
 * Web-page extraction for the extract stage (ADR-0004). Fetch, extract on device, then either
 * accept the result, render the page in a hidden WebView and re-gate it, or ask the cleanup model
 * which blocks to keep. The model never rewrites text, so it cannot add content.
 */
import { z } from 'zod';

import { loadPipeline } from '@/core/extract/load';
import {
  applySelection,
  buildSelectionPrompt,
  chunkForSelection,
  MAX_SELECTION_CHUNKS,
  parseSelectionResponse,
  TOO_LARGE_TO_READ,
  selectionSchema,
} from '@/core/extract/select';
import type { Block } from '@/core/extract/types';
import type { JsonSchemaSpec } from '@/core/llm/transport';

import { StageFailure } from '../errors';
import { FETCH_LIMITS } from '../limits';

import type { StageContext } from '../context';

/** Output tokens one index of a keep list takes, and the fixed JSON around the list. */
const SELECTION_TOKENS_PER_INDEX = 4;
const SELECTION_REPLY_TOKENS = 16;

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
  const { extractArticle, extractFromHtml } = await loadPipeline();
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
 * Asks the cleanup model which blocks to keep, one call per chunk of the page, so no prompt grows
 * past the model's context. A reply that fails validation keeps its chunk whole, so a bad reply can
 * never blank a chapter. The cost of every call is recorded either way.
 */
export async function selectBlocks(
  ctx: StageContext,
  blocks: readonly Block[],
  meta: { title: string | null; lang: string | null },
): Promise<readonly Block[]> {
  const chunks = chunkForSelection(blocks);
  if (chunks.length > MAX_SELECTION_CHUNKS) {
    throw new StageFailure('INPUT_TOO_LONG', TOO_LARGE_TO_READ, {
      retryable: false,
      detail: `selection_chunks=${chunks.length}`,
    });
  }
  const model = ctx.record.settings.cleanupModel;
  const transport = ctx.meter.transport(model, ctx.ports.llm.transportFor(model));
  const keep: number[] = [];
  for (const chunk of chunks) {
    const prompt = buildSelectionPrompt(
      chunk.map((item) => item.block),
      meta,
    );
    const reply = await transport({
      system: prompt.system,
      user: prompt.user,
      jsonSchema: SELECTION_JSON_SCHEMA,
      signal: ctx.signal,
      // A keep list is a few tokens per block, so twice that bounds the reply well above any valid answer.
      maxOutputTokens: 2 * (chunk.length * SELECTION_TOKENS_PER_INDEX + SELECTION_REPLY_TOKENS),
    });
    const selection = parseSelectionResponse(reply.text);
    const kept = selection
      ? selection.keep.filter((position) => position < chunk.length)
      : chunk.map((_, position) => position);
    for (const position of kept) {
      const item = chunk[position];
      if (item) keep.push(item.index);
    }
  }
  return applySelection(blocks, keep).blocks;
}
