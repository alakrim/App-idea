import { detectScript, normalizeText, normalizeWhitespace } from './normalize';

export type ParagraphKind = 'text' | 'heading' | 'quote' | 'dialogue';

export interface ParagraphBlock {
  text: string;
  kind: ParagraphKind;
}

/** Chapter and part markers in the languages the app supports. Matched at the start of a line. */
const HEADING_PATTERNS: readonly RegExp[] = [
  /^第\s*[0-9０-９一二三四五六七八九十百千万零〇两]+\s*[章节節回话話集卷部篇]/u,
  /^(?:chapter|capítulo|capitulo|capitolo|chapitre|kapitel)\b/iu,
  /^ch\.?\s*\d+\b/iu,
  /^제\s*\d+\s*[장화話]/u,
  /^\d+\s*화(?:\s|$)/u,
  /^(?:序章|序幕|楔子|引子|前言|后记|後記|终章|終章|尾声|尾聲|番外|プロローグ|エピローグ)/u,
  /^(?:prologue|epilogue|prólogo|prologo|epílogo|epilogo|introduction|preface)\b/iu,
];
/** Ends that rule a line out as a heading: sentence ends, closing quotes and clause breaks. */
const NON_HEADING_ENDING = /[.!?…。！？‼⁇⁈⁉"'“”‘’«»「」『』（）()[\],:;，、：；]$/u;
/** Small words that may stay lower-case inside a Title Case heading. */
const TITLE_SMALL_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'da',
  'das',
  'de',
  'del',
  'della',
  'des',
  'di',
  'do',
  'dos',
  'du',
  'e',
  'el',
  'en',
  'et',
  'for',
  'from',
  'in',
  'is',
  'la',
  'le',
  'les',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'und',
  'van',
  'von',
  'with',
  'y',
]);
const TITLE_MAX_WORDS = 10;
const HEADING_MAX_CHARS = 120;
const OPENING_QUOTES: Readonly<Record<string, string>> = {
  '“': '”',
  '„': '“',
  '«': '»',
  '「': '」',
  '『': '』',
  '"': '"',
};
const DIALOGUE_OPENERS: ReadonlySet<string> = new Set(['"', '“', '„', '«', '「', '『', '—']);
const LINE_ENDS_A_SENTENCE = /[.!?…。！？"”」』»]$/u;

/**
 * Splits chapter text into classified paragraphs.
 *
 * Blank lines separate paragraphs. Each single line is a paragraph for CJK text and for novel
 * style text (no blank lines and most lines end a sentence). Otherwise single line breaks are soft
 * wraps and are joined with spaces.
 */
export function toParagraphs(input: string): ParagraphBlock[] {
  const text = normalizeText(input);
  if (text === '') return [];
  const lineMode = detectScript(text) === 'cjk' || (!text.includes('\n\n') && isNovelStyle(text));
  const pieces = lineMode
    ? text.split('\n')
    : text.split(/\n{2,}/u).map((block) => block.replace(/\n/gu, ' '));

  const blocks: ParagraphBlock[] = [];
  for (const piece of pieces) {
    const paragraph = normalizeWhitespace(piece);
    if (paragraph !== '') blocks.push({ text: paragraph, kind: classify(paragraph) });
  }
  return blocks;
}

function isNovelStyle(text: string): boolean {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length < 2) return false;
  const terminated = lines.filter((line) => LINE_ENDS_A_SENTENCE.test(line)).length;
  return terminated / lines.length >= 0.5;
}

function classify(text: string): ParagraphKind {
  if (isHeading(text)) return 'heading';
  if (isQuotedBlock(text)) return 'quote';
  if (DIALOGUE_OPENERS.has(text.charAt(0))) return 'dialogue';
  return 'text';
}

function isHeading(text: string): boolean {
  if (text.length > HEADING_MAX_CHARS || NON_HEADING_ENDING.test(text)) return false;
  if (HEADING_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return isTitleCase(text);
}

/** Up to ten words, every content word capitalised, at least one of them. */
function isTitleCase(text: string): boolean {
  const words = text
    .split(/\s+/u)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter((word) => word !== '');
  if (words.length === 0 || words.length > TITLE_MAX_WORDS) return false;
  let contentWords = 0;
  for (const word of words) {
    if (TITLE_SMALL_WORDS.has(word.toLowerCase())) continue;
    if (!/^[\p{Lu}\p{Lt}\p{N}]/u.test(word)) return false;
    contentWords += 1;
  }
  return contentWords > 0;
}

/**
 * A block quotation: one quotation that opens and closes the paragraph and is followed by an
 * attribution (`— Name`). Without an attribution it is dialogue, including a quote followed by
 * narration (`"Hi," she said.`) or a Japanese 「…」 line.
 */
function isQuotedBlock(text: string): boolean {
  const open = text.charAt(0);
  const close = OPENING_QUOTES[open];
  if (close === undefined) return false;
  const closeIndex = text.lastIndexOf(close);
  if (closeIndex <= 0) return false;
  const inner = text.slice(1, closeIndex);
  if (inner.includes(open) || inner.includes(close)) return false;
  const after = text.slice(closeIndex + 1).trim();
  return /^[—–-]{1,2}\s*\S/u.test(after);
}
