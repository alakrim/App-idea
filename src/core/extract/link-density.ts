/**
 * Link density of the page's main candidate, read from the raw page. Readability removes anchors, so
 * the measure has to see the page as fetched. It reads the document without changing it: Readability
 * and Defuddle both rewrite the tree they are given, and they run after this measure.
 */

/** Elements whose content is never page text. Their subtrees are left out of the measure. */
const NON_TEXT = new Set(['script', 'style', 'noscript', 'template']);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function isNonText(node: Node): boolean {
  return node.nodeType === ELEMENT_NODE && NON_TEXT.has((node as Element).localName);
}

/** True when the node and none of its ancestors is a non-text element. */
function isInText(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    if (isNonText(current)) return false;
  }
  return true;
}

/** Non-whitespace characters of the text under `root`, skipping non-text subtrees. */
function countTextChars(root: Node): number {
  let count = 0;
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || isNonText(node)) continue;
    if (node.nodeType === TEXT_NODE) {
      count += (node.nodeValue ?? '').replace(/\s+/g, '').length;
      continue;
    }
    for (let child = node.lastChild; child; child = child.previousSibling) {
      stack.push(child);
    }
  }
  return count;
}

function firstInText(document: Document, selector: string): Element | null {
  return Array.from(document.querySelectorAll(selector)).find(isInText) ?? null;
}

/**
 * Share of the main candidate's text that sits inside links, from 0 to 1. The candidate is `article`,
 * else `main`, `[role=main]`, or `body`. Returns null when the candidate has no text.
 */
export function mainLinkDensity(document: Document): number | null {
  const candidate =
    firstInText(document, 'article') ??
    firstInText(document, 'main') ??
    firstInText(document, '[role="main"]') ??
    document.body;
  if (!candidate) return null;

  const totalChars = countTextChars(candidate);
  if (totalChars === 0) return null;

  let linkChars = 0;
  for (const anchor of Array.from(candidate.querySelectorAll('a'))) {
    if (isInText(anchor)) linkChars += countTextChars(anchor);
  }
  return Math.min(1, linkChars / totalChars);
}
