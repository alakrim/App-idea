/*
 * Local preview of a URL before a chapter is created: quality, excerpt and the next-chapter link.
 * Everything here runs on the device and makes no paid call.
 */
import { parseHTML } from 'linkedom';

import { LEXICON_RULES } from '@/core/extract/lexicon';
import type { Decision } from '@/core/extract/types';
import type { SourcePreview } from '@/features/pipeline/facade';

/** How many characters of the cleaned text the preview shows. */
export const EXCERPT_CHARS = 400;

/** Words that mark a "previous" link. A next-link lexicon match with one of these is rejected. */
const PREVIOUS_WORDS =
  /\bprev(?:ious)?\b|\bback\b|上一|前へ|前の|前章|前話|이전|précéd|anterior|precedente|zurück/iu;

const NEXT_RULES = LEXICON_RULES.filter((rule) => rule.id.startsWith('nav_next'));
/** Link text longer than this is a sentence, not a navigation label. */
const MAX_LINK_TEXT = 60;

export function qualityOf(decision: Decision, text: string): SourcePreview['quality'] {
  if (decision === 'webview') return 'needs_render';
  if (text.trim() === '') return 'empty';
  if (decision === 'llm_select') return 'needs_ai';
  return 'good';
}

/** The first characters of the text, cut on a code point boundary. */
export function excerptOf(text: string): string {
  return Array.from(text.trim()).slice(0, EXCERPT_CHARS).join('');
}

function absoluteHttp(href: string, pageUrl: string): string | null {
  try {
    const url = new URL(href, pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString() === new URL(pageUrl).toString() ? null : url.toString();
  } catch {
    return null;
  }
}

function isNextLabel(text: string): boolean {
  const label = text.replace(/\s+/gu, ' ').trim();
  if (label === '' || label.length > MAX_LINK_TEXT) return false;
  if (PREVIOUS_WORDS.test(label)) return false;
  return NEXT_RULES.some((rule) => rule.pattern.test(label));
}

/**
 * The URL of the next chapter, from a `rel="next"` link first and then from a link whose text is a
 * "next chapter" label in one of the lexicon's languages. Null when the page has neither.
 */
export function findNextChapterUrl(html: string, pageUrl: string): string | null {
  const { document } = parseHTML(html);
  for (const link of Array.from(document.querySelectorAll('link[rel], a[rel]'))) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/u);
    if (!rel.includes('next')) continue;
    const href = link.getAttribute('href');
    const target = href ? absoluteHttp(href, pageUrl) : null;
    if (target) return target;
  }
  for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
    if (!isNextLabel(anchor.textContent ?? '')) continue;
    const target = absoluteHttp(anchor.getAttribute('href') ?? '', pageUrl);
    if (target) return target;
  }
  return null;
}
