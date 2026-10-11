import { parseHTML } from 'linkedom';

import { normalizeWhitespace } from '../text/normalize';

import type { Block, BlockTag } from './types';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** Elements whose content is never narrative text. */
const SKIPPED = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'button',
  'select',
  'textarea',
  'input',
  'form',
]);

/** Phrasing elements. They continue the current block instead of starting a new one. */
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'big',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'tt',
  'u',
  'var',
  'label',
  'picture',
  'img',
  'wbr',
  'ruby',
  'rt',
  'rp',
]);

const HEADING = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Maps a block-level element to the tag its text gets. Unlisted containers inherit the context. */
function tagFor(name: string, context: BlockTag): BlockTag {
  if (HEADING.has(name)) return 'h';
  if (name === 'li') return 'li';
  if (name === 'blockquote') return 'blockquote';
  if (name === 'pre') return 'pre';
  return context;
}

function cleanText(raw: string, tag: BlockTag): string {
  if (tag === 'pre') return raw.replace(/\r\n?/g, '\n').trim();
  return normalizeWhitespace(raw);
}

/**
 * Converts extracted content HTML into ordered blocks. A `<br>` ends a block, so `<br><br>`
 * novel pages keep their paragraphs. Inside `<pre>`, `<br>` becomes a newline.
 */
export function htmlToBlocks(contentHtml: string): Block[] {
  const { document } = parseHTML(`<!doctype html><html><body>${contentHtml}</body></html>`);
  const out: Block[] = [];
  let buffer = '';

  const flush = (tag: BlockTag): void => {
    const text = cleanText(buffer, tag);
    buffer = '';
    if (text) out.push({ tag, text });
  };

  const walk = (node: Node, context: BlockTag): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        buffer += child.nodeValue ?? '';
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;

      const element = child as Element;
      const name = element.tagName.toLowerCase();
      if (SKIPPED.has(name)) continue;

      if (name === 'br') {
        if (context === 'pre') buffer += '\n';
        else flush(context);
        continue;
      }

      if (INLINE.has(name)) {
        walk(element, context);
        continue;
      }

      const childContext = tagFor(name, context);
      flush(context);
      walk(element, childContext);
      flush(childContext);
    }
  };

  walk(document.body, 'p');
  flush('p');
  return out;
}
