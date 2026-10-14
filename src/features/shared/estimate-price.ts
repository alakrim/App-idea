import type { CostEstimate, CostLine } from '@/features/pipeline/facade';

/** True when the catalogue could not price this stage, so the number is missing rather than zero. */
export function isUnpricedLine(line: CostLine): boolean {
  return line.usd === null;
}

/** True when any stage is unpriced, so the total undercounts and must not be shown as a price. */
export function isEstimateUnknown(estimate: Pick<CostEstimate, 'lines'>): boolean {
  return estimate.lines.some(isUnpricedLine);
}

/** The narration stage's price, or null when it cannot be priced. */
export function narrationUsd(estimate: Pick<CostEstimate, 'lines'>): number | null {
  return estimate.lines.find((entry) => entry.stage === 'narrate')?.usd ?? null;
}
