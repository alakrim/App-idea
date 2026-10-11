import { coverGradients } from './tokens';

export interface CoverGradient {
  from: string;
  to: string;
}

/** Same title, same cover: a stable hash picks the gradient pair. */
export function coverGradientFor(title: string): CoverGradient {
  let hash = 0;
  for (const char of title) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  const pair = coverGradients[hash % coverGradients.length] ?? coverGradients[0];
  return { from: pair?.[0] ?? '', to: pair?.[1] ?? '' };
}

/** First user-perceived character, so CJK and emoji titles get a whole glyph. */
export function monogramFor(title: string): string {
  const first = Array.from(title.trim())[0];
  return first ? first.toLocaleUpperCase() : '?';
}
