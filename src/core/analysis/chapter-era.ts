import type { AmbienceEra } from './ambience-taxonomy';

/**
 * The era of a whole chapter from the eras of its passages (A4). The most common era wins. A tie goes
 * to the era that appears first in the chapter, so the result never depends on map order. Passages
 * with no era (null) do not vote. Null when no passage names an era.
 */
export function chapterEraOf(passageEras: readonly (AmbienceEra | null)[]): AmbienceEra | null {
  const tally = new Map<AmbienceEra, { count: number; firstIndex: number }>();
  passageEras.forEach((era, index) => {
    if (era === null) return;
    const entry = tally.get(era);
    if (entry) entry.count += 1;
    else tally.set(era, { count: 1, firstIndex: index });
  });

  let winner: { era: AmbienceEra; count: number; firstIndex: number } | null = null;
  for (const [era, { count, firstIndex }] of tally) {
    const beats =
      winner === null ||
      count > winner.count ||
      (count === winner.count && firstIndex < winner.firstIndex);
    if (beats) winner = { era, count, firstIndex };
  }
  return winner?.era ?? null;
}
