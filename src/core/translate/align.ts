import type { TranslatedItem } from './types';

export interface AlignmentResult {
  /** True only when nothing is missing, extra or duplicated. */
  readonly ok: boolean;
  /** Expected idx values with no usable (non-blank) translation, ascending. */
  readonly missing: number[];
  /** idx values returned that were not expected, ascending. */
  readonly extra: number[];
  /** idx values returned more than once, ascending. */
  readonly dupes: number[];
}

/**
 * Compares a reply with the idx values that were sent. An idx counts as covered when some entry
 * for it has non-blank text, so a blank entry leaves that sentence missing.
 */
export function validateAlignment(
  expected: readonly number[],
  output: readonly TranslatedItem[],
): AlignmentResult {
  const expectedSet = new Set(expected);
  const counts = new Map<number, number>();
  for (const item of output) counts.set(item.idx, (counts.get(item.idx) ?? 0) + 1);

  const dupes = [...counts]
    .filter(([, count]) => count > 1)
    .map(([idx]) => idx)
    .sort(ascending);
  const extra = [...counts.keys()].filter((idx) => !expectedSet.has(idx)).sort(ascending);
  const covered = collectTranslations(output);
  const missing = [...expectedSet].filter((idx) => !covered.has(idx)).sort(ascending);

  return {
    ok: missing.length === 0 && extra.length === 0 && dupes.length === 0,
    missing,
    extra,
    dupes,
  };
}

/**
 * The usable translation for each idx. The first non-blank entry wins. Blank entries and, when
 * `allowed` is given, idx values outside it are skipped.
 */
export function collectTranslations(
  output: readonly TranslatedItem[],
  allowed?: ReadonlySet<number>,
): Map<number, string> {
  const out = new Map<number, string>();
  for (const item of output) {
    if (allowed && !allowed.has(item.idx)) continue;
    const text = item.text.trim();
    if (text === '' || out.has(item.idx)) continue;
    out.set(item.idx, text);
  }
  return out;
}

function ascending(a: number, b: number): number {
  return a - b;
}
