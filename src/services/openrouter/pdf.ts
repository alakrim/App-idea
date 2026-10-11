import { sendChatCompletion } from './chat';

import type { ChatAnnotation, ChatDeps, ChatUsage } from './chat';

/** The engine is always explicit. Leaving it out can silently bill OCR (see R1, section 2). */
export type PdfEngine = 'cloudflare-ai' | 'mistral-ocr';

export interface PdfInput {
  base64: string;
  fileName: string;
  engine: PdfEngine;
  /** Model that receives the parsed text. The reply is discarded, so pick a cheap one. */
  model: string;
  signal?: AbortSignal;
}

export interface PdfResult {
  text: string;
  usage: ChatUsage;
  generationId: string | null;
  model: string;
}

/** The reply is discarded, so cap its output tokens to avoid paying for a re-typed document. */
const PDF_REPLY_MAX_TOKENS = 5;

/**
 * Extracts the text of a PDF through the OpenRouter file-parser plugin. The parsed text comes back
 * in `message.annotations`, not in the model's reply (R1, section 2). A document with no text comes
 * back as an empty string, with the usage of the call.
 */
export async function parsePdf(deps: ChatDeps, input: PdfInput): Promise<PdfResult> {
  const completion = await sendChatCompletion(
    deps,
    {
      model: input.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Reply with OK.' },
            {
              type: 'file',
              file: {
                filename: input.fileName,
                file_data: `data:application/pdf;base64,${input.base64}`,
              },
            },
          ],
        },
      ],
      plugins: [{ id: 'file-parser', pdf: { engine: input.engine } }],
      max_tokens: PDF_REPLY_MAX_TOKENS,
      usage: { include: true },
    },
    input.signal,
  );

  // An empty text is returned, not thrown, so the caller can still record what the call cost. The
  // pipeline decides what an empty PDF means (a scan that needs OCR).
  const text = extractFileText(completion.annotations);
  return {
    text,
    usage: completion.usage,
    generationId: completion.generationId,
    model: completion.model,
  };
}

function extractFileText(annotations: ChatAnnotation[]): string {
  const seenHashes = new Set<string>();
  const parts: string[] = [];
  for (const annotation of annotations) {
    if (annotation.type !== 'file' || !annotation.file) continue;
    const hash = annotation.file.hash;
    if (hash) {
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);
    }
    for (const part of annotation.file.content ?? []) {
      if (part.type === 'text' && part.text) parts.push(part.text);
    }
  }
  return parts.join('\n\n').trim();
}
