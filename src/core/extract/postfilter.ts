import { matchRule } from './lexicon';
import { endsSentence, exactKey, measureUnits, shapeKey } from './text-metrics';

import type { Block, RemovedBlock } from './types';

export interface PostfilterContext {
  title?: string | null;
  byline?: string | null;
}

export interface PostfilterResult {
  blocks: Block[];
  removed: RemovedBlock[];
}

/** R3 section 2.1 H3: a short block that appears this many times is boilerplate. */
const REPEAT_THRESHOLD = 3;
const REPEAT_MAX_UNITS = 40;

/** Separators that usually introduce a site name in a page title. */
const SITE_SUFFIX = /\s+[|–—·»-]\s+|\s*»\s*/;

/** Pipe, breadcrumb or bullet separators between words: "Weather | Live updates", "Home › News". */
const LABEL_SEPARATOR = /\s[|›»•·]\s/;
/** A label is short. A longer line that happens to contain a bar is prose. */
const LABEL_MAX_UNITS = 12;

/** A kicker, section or breadcrumb line: a separator, short, and no terminal punctuation. */
function isLabelLine(text: string, units: number): boolean {
  return LABEL_SEPARATOR.test(text) && units < LABEL_MAX_UNITS && !endsSentence(text);
}

function titleKeys(title: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (!title?.trim()) return keys;
  keys.add(exactKey(title));
  const head = title.split(SITE_SUFFIX)[0];
  if (head?.trim()) keys.add(exactKey(head));
  return keys;
}

/**
 * Deterministic cleanup of extracted blocks. The order of checks decides the removal reason:
 * duplicate title, byline, lexicon rule, label line, then repeated short block. A block that ends a
 * sentence is never removed as a repeated fragment, so repeated dialogue such as `"Yes."` survives.
 */
export function postfilter(
  blocks: readonly Block[],
  context: PostfilterContext = {},
): PostfilterResult {
  const titles = titleKeys(context.title);
  const byline = context.byline?.trim() ? exactKey(context.byline) : null;

  const shapeCounts = new Map<string, number>();
  for (const block of blocks) {
    const key = shapeKey(block.text);
    shapeCounts.set(key, (shapeCounts.get(key) ?? 0) + 1);
  }

  const kept: Block[] = [];
  const removed: RemovedBlock[] = [];

  blocks.forEach((block, index) => {
    const units = measureUnits(block.text);
    const remove = (reason: string): void => {
      removed.push({ index, text: block.text, reason });
    };

    if (titles.has(exactKey(block.text))) return remove('duplicate_title');
    if (byline !== null && exactKey(block.text) === byline) return remove('byline');

    const rule = matchRule(block.text, units);
    if (rule) return remove(rule.id);

    if (isLabelLine(block.text, units)) return remove('label_line');

    const repeats = shapeCounts.get(shapeKey(block.text)) ?? 0;
    if (repeats >= REPEAT_THRESHOLD && units < REPEAT_MAX_UNITS && !endsSentence(block.text)) {
      return remove('repeated_short_block');
    }

    kept.push(block);
  });

  return { blocks: kept, removed };
}
