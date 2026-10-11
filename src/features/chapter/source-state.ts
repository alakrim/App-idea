import { LATIN_CHARS_PER_WORD } from '@/core/pipeline/estimate';

export type SourceMode = 'link' | 'pdf' | 'text';

/** Characters per byte of a PDF file, a rough guide until the text is extracted. */
export const PDF_CHARS_PER_BYTE = 0.5;
export const TITLE_MAX = 60;

/** A web address the app can fetch: http or https, with a real host. */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const webProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    return webProtocol && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** The inline message under the link field, or null when there is nothing to say yet. */
export function urlProblem(value: string): string | null {
  if (value.trim() === '' || isWebUrl(value)) return null;
  return 'Enter a full link, starting with https://';
}

/** A usable title from the first line of pasted text. */
export function titleFromText(text: string): string {
  const firstLine =
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? '';
  return Array.from(firstLine).slice(0, TITLE_MAX).join('');
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').slice(0, TITLE_MAX);
}

export type EstimateBasis =
  | { mode: 'link'; wordCount: number }
  | { mode: 'pdf'; sizeBytes: number }
  | { mode: 'text'; text: string };

/** The character count the cost estimate is run on for the current source. */
export function estimateChars(basis: EstimateBasis): number {
  switch (basis.mode) {
    case 'link':
      return basis.wordCount * LATIN_CHARS_PER_WORD;
    case 'pdf':
      return Math.round(basis.sizeBytes * PDF_CHARS_PER_BYTE);
    case 'text':
      return Array.from(basis.text).length;
  }
}

export interface CreateGate {
  mode: SourceMode;
  /** A link whose preview loaded with readable text. */
  linkReady: boolean;
  hasFile: boolean;
  textLength: number;
  title: string;
  creating: boolean;
}

/** The primary button stays off until the source is usable and the chapter has a title. */
export function canCreateChapter(gate: CreateGate): boolean {
  if (gate.creating || gate.title.trim() === '') return false;
  switch (gate.mode) {
    case 'link':
      return gate.linkReady;
    case 'pdf':
      return gate.hasFile;
    case 'text':
      return gate.textLength > 0;
  }
}
