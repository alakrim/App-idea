/*
 * Size limits for what the pipeline reads, in one place. Each limit is checked before the bytes are
 * read into memory, and the copy says what the listener can do about it.
 */
import type { FetchLimits } from './ports';

const MIB = 1024 * 1024;

/** The largest PDF the file parser takes. A bigger file is refused before it is read. */
export const PDF_MAX_BYTES = 25 * MIB;

/** The largest page (HTML or text), fetched or rendered. A page this size is almost never an article. */
export const PAGE_MAX_BYTES = 5 * MIB;

export const FETCH_LIMITS: FetchLimits = { maxBytes: PAGE_MAX_BYTES, timeoutMs: 30_000 };

/** The refusal shown when a picked PDF is over the limit. Sizes are rounded up, so it never reads as allowed. */
export function pdfTooLargeMessage(bytes: number): string {
  return `This PDF is ${Math.ceil(bytes / MIB)} MB. Lectio can read PDFs up to ${PDF_MAX_BYTES / MIB} MB.`;
}

/** The UTF-8 length of a string, counted from its code units without encoding it. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (isHighSurrogate(code) && isLowSurrogate(text.charCodeAt(index + 1))) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
