/*
 * The extract stage: URL, PDF or pasted text in, plain chapter text out. It sets the chapter's
 * title, guessed source language and word count, and records the clean job (done when the cleanup
 * model ran, skipped otherwise).
 */
import { SELECTION_PROMPT_VERSION } from '@/core/extract/prompts';
import { countCodePoints } from '@/core/text/build';
import { estimateWordCount } from '@/core/text/word-count';
import { guessLanguage } from '@/core/translate/detect';

import { StageFailure } from '../errors';
import { stableHash, hashText } from '../hash';
import { writeJob } from '../job-records';
import { stripPdfFurniture } from './pdf-text';
import { extractWebPage } from './web-extract';

import type { PreparedStage, StageContext, StageDefinition } from '../context';

/** A PDF page with fewer characters than this is treated as a scan (ADR-0004). */
export const MIN_CHARS_PER_PAGE = 50;

const EMPTY_MESSAGE = 'We could not find any text in this chapter.';

export const extractStage: StageDefinition = {
  stage: 'extract',
  async prepare(ctx) {
    const { chapter, settings } = ctx.record;
    const { source } = chapter;
    const model = settings.cleanupModel;
    const identity =
      source.kind === 'url'
        ? source.url
        : source.kind === 'pdf'
          ? source.fileUri
          : hashText(await requireSourceText(ctx));
    const inputHash = stableHash([
      'extract',
      source.kind,
      identity,
      source.kind === 'pdf' ? ctx.options.pdfEngine : null,
      model,
      SELECTION_PROMPT_VERSION,
    ]);
    return {
      inputHash,
      model,
      promptVersion: SELECTION_PROMPT_VERSION,
      skip: false,
      execute: () => execute(ctx, inputHash),
    } satisfies PreparedStage;
  },
};

async function execute(ctx: StageContext, inputHash: string): Promise<void> {
  const { chapter } = ctx.record;
  const { source } = chapter;
  if (source.kind === 'url') {
    const web = await extractWebPage(ctx, source.url);
    await finish(ctx, inputHash, {
      text: web.text,
      extractedTitle: web.title,
      lang: web.lang,
      cleaned: web.cleaned,
    });
    return;
  }
  if (source.kind === 'pdf') {
    await extractPdf(ctx, inputHash, source.fileUri, source.fileName);
    return;
  }
  const text = await requireSourceText(ctx);
  await finish(ctx, inputHash, { text, extractedTitle: source.label, lang: null, cleaned: false });
}

async function extractPdf(
  ctx: StageContext,
  inputHash: string,
  fileUri: string,
  fileName: string,
): Promise<void> {
  const result = await ctx.ports.pdf.extract({
    fileUri,
    engine: ctx.options.pdfEngine,
    signal: ctx.signal,
  });
  await ctx.meter.recordChat(result.model, result.usage);

  const pageCount = Math.max(1, result.pages.length);
  if (countCodePoints(result.text.trim()) < MIN_CHARS_PER_PAGE * pageCount) {
    throw new StageFailure(
      'CONTENT_EMPTY',
      'This PDF has little or no text, so it may be a scan. Run OCR to read it.',
      { retryable: false, detail: 'scanned_pdf' },
    );
  }
  const text = stripPdfFurniture(result.pages.length > 0 ? result.pages : [result.text]);
  await finish(ctx, inputHash, {
    text,
    extractedTitle: fileName.replace(/\.pdf$/iu, ''),
    lang: null,
    cleaned: false,
  });
}

interface Finished {
  readonly text: string;
  readonly extractedTitle: string | null;
  readonly lang: string | null;
  readonly cleaned: boolean;
}

/**
 * Saves the extracted text and the chapter metadata. A title the user typed is never replaced. The
 * language is guessed from the text, and the detected language of the page is used when the guess
 * fails.
 */
async function finish(ctx: StageContext, inputHash: string, found: Finished): Promise<void> {
  const { chapters } = ctx.ports;
  const { chapter, settings } = ctx.record;
  const text = found.text.trim();
  if (text === '') throw new StageFailure('CONTENT_EMPTY', EMPTY_MESSAGE, { retryable: false });

  const sourceLang = guessLanguage(text) ?? found.lang ?? chapter.sourceLang;
  const title = chapter.title.trim() !== '' ? chapter.title : (found.extractedTitle?.trim() ?? '');
  await chapters.saveSourceText(ctx.chapterId, text);
  await chapters.setMeta(ctx.chapterId, {
    title,
    sourceLang: sourceLang ?? null,
    wordCount: estimateWordCount(text),
  });
  await writeJob(ctx.ports, ctx.chapterId, 'clean', {
    status: found.cleaned ? 'done' : 'skipped',
    inputHash,
    model: settings.cleanupModel,
    promptVersion: SELECTION_PROMPT_VERSION,
    progress: 1,
    costUsd: ctx.meter.spentUsd,
    error: null,
  });
}

async function requireSourceText(ctx: StageContext): Promise<string> {
  const text = await ctx.ports.chapters.getSourceText(ctx.chapterId);
  if (text === null || text.trim() === '') {
    throw new StageFailure('CONTENT_EMPTY', EMPTY_MESSAGE, {
      retryable: false,
      detail: 'no_source_text',
    });
  }
  return text;
}
