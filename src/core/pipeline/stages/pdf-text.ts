/*
 * Removes running headers, footers and page numbers from the text of a PDF, page by page. Pure.
 *
 * A line counts as a header or footer when its shape (digits folded to `#`) appears on at least 30%
 * of the pages. This needs at least three pages, so a short document keeps all of its text. A line
 * that is only a page number is removed on any page.
 */
import { normalizeWhitespace } from '@/core/text/normalize';

const MIN_PAGES_FOR_REPEATS = 3;
const REPEAT_SHARE = 0.3;
/** Shorter lines ("Yes.", "* * *") and longer ones are never treated as furniture. */
const MIN_FURNITURE_CHARS = 6;
const MAX_FURNITURE_CHARS = 120;
/** A page number on its own: "12", "- 12 -", "Page 12", "12 of 340". */
const PAGE_NUMBER_LINE = /^(?:page\s+)?[-–—]?\s*\d{1,3}\s*[-–—]?(?:\s+of\s+\d{1,4})?$/iu;

function shapeOf(line: string): string {
  return normalizeWhitespace(line).toLowerCase().replace(/\d+/gu, '#');
}

/** Shapes that appear on enough pages to be running furniture. */
function repeatedShapes(linesPerPage: readonly (readonly string[])[]): Set<string> {
  if (linesPerPage.length < MIN_PAGES_FOR_REPEATS) return new Set();
  const pageCounts = new Map<string, number>();
  for (const lines of linesPerPage) {
    const onThisPage = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < MIN_FURNITURE_CHARS || trimmed.length > MAX_FURNITURE_CHARS) continue;
      onThisPage.add(shapeOf(trimmed));
    }
    for (const key of onThisPage) pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(2, linesPerPage.length * REPEAT_SHARE);
  return new Set([...pageCounts].filter(([, count]) => count >= threshold).map(([key]) => key));
}

/** The text of all pages, joined with a blank line between pages, without furniture. */
export function stripPdfFurniture(pages: readonly string[]): string {
  const linesPerPage = pages.map((page) => page.split(/\r?\n/u));
  const furniture = repeatedShapes(linesPerPage);
  const kept = linesPerPage.map((lines) =>
    lines
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed === '') return true;
        if (PAGE_NUMBER_LINE.test(trimmed)) return false;
        return !furniture.has(shapeOf(trimmed));
      })
      .join('\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim(),
  );
  return kept.filter((page) => page !== '').join('\n\n');
}
