import { readFileSync } from 'fs';
import { join } from 'path';

/** A real-world page from the extract fixtures. Accepted by the quality gate. */
export function extractFixture(name: string): string {
  return readFileSync(join(__dirname, '..', '..', 'extract', '__fixtures__', name), 'utf8');
}

/**
 * A short article of `paragraphs` near-identical paragraphs. Six of them score between the accept
 * and WebView thresholds, which routes the page to LLM index selection.
 */
export function articleHtml(paragraphs: number): string {
  const body = Array.from(
    { length: paragraphs },
    (_, n) =>
      `<p>The harbour council met on day ${n} and discussed the storm damage along the quay, where boats were moved inland before the wind rose, and residents were asked to stay indoors.</p>`,
  ).join('');
  return `<html><head><title>Storm report</title></head><body><article><h1>Storm report</h1>${body}</article></body></html>`;
}

/** Plain text of `count` paragraphs of about `chars` characters, separated by blank lines. */
export function longText(count: number, chars: number): string {
  return Array.from({ length: count }, (_, n) => {
    const sentence = `Paragraph ${n} describes the sea, the harbour and the people who walk along the quay at dusk. `;
    return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars).trim();
  }).join('\n\n');
}
