import type { CostEstimate } from '@/features/pipeline/facade';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** "4 h 20 m" for long runs, "45 m" under an hour. Rounds to the nearest minute. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MS_PER_MINUTE));
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return hours > 0 ? `${hours} h ${rest} m` : `${rest} m`;
}

export function formatChapterCount(count: number): string {
  return count === 1 ? '1 chapter' : `${count} chapters`;
}

/** The library card subtitle, for example "12 chapters · 4 h 20 m". */
export function formatSeriesSummary(chapterCount: number, totalDurationMs: number): string {
  return `${formatChapterCount(chapterCount)} · ${formatDuration(totalDurationMs)}`;
}

export function formatWordCount(words: number): string {
  return `${new Intl.NumberFormat('en-US').format(words)} words`;
}

/** Dollar amounts for the cost card. Anything under a cent reads as "< $0.01". */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.005) return '< $0.01';
  return `$${usd.toFixed(2)}`;
}

/** "≈ $0.04 (0.03–0.06)". The range is the estimate's own low and high bounds. */
export function formatCostEstimate(
  estimate: Pick<CostEstimate, 'totalUsd' | 'lowUsd' | 'highUsd'>,
): string {
  const total = formatUsd(estimate.totalUsd);
  const low = estimate.lowUsd.toFixed(2);
  const high = estimate.highUsd.toFixed(2);
  return `≈ ${total} (${low}–${high})`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
