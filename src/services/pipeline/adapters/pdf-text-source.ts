/*
 * PdfTextSource: the PDF's bytes go to OpenRouter's file-parser with an explicit engine. The
 * `cloudflare-ai` engine is free and handles text PDFs (ADR-0004 amendment). `mistral-ocr` is only
 * used after the user agrees to its cost.
 *
 * Pages: the parser's reply documents no page delimiters (R1, section 2), so the text is returned
 * as one page. The stage then judges scans by total length, and furniture removal needs at least
 * three pages, so it does not run on a PDF. Both are open issues until a live PDF is checked.
 */
import type { PdfEngine, PdfTextResult, PdfTextSource } from '@/core/pipeline/ports';
import type { OpenRouterClient } from '@/services/openrouter';

import type { LibraryFiles } from '../library-files';

export interface PdfTextSourceDeps {
  readonly openrouter: Pick<OpenRouterClient, 'parsePdf'>;
  readonly files: Pick<LibraryFiles, 'readBase64'>;
  /** The model that receives the parsed text. Its reply is discarded, so a cheap model is right. */
  readonly parserModel: () => string;
}

export function fileNameOf(uri: string): string {
  const name = decodeURIComponent(uri.split('/').pop() ?? '').split('?')[0];
  return name && name.length > 0 ? name : 'document.pdf';
}

export function createPdfTextSource(deps: PdfTextSourceDeps): PdfTextSource {
  return {
    async extract({ fileUri, engine, signal }): Promise<PdfTextResult> {
      const base64 = await deps.files.readBase64(fileUri);
      const model = deps.parserModel();
      const result = await deps.openrouter.parsePdf({
        base64,
        fileName: fileNameOf(fileUri),
        engine: engine as PdfEngine,
        model,
        signal,
      });
      return {
        text: result.text,
        pages: [result.text],
        model: result.model,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          costUsd: result.usage.costUsd,
        },
      };
    },
  };
}
