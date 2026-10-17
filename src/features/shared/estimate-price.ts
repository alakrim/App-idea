import type { CostEstimate, CostLine } from '@/features/pipeline/facade';

/** The pipeline prices a stage it cannot look up as $0 with this basis. That is not a real price. */
const PRICING_UNAVAILABLE = 'pricing unavailable';

/** True when the catalogue could not price this stage, so the number is missing rather than zero. */
export function isUnpricedLine(line: CostLine): boolean {
  return line.usd === 0 && line.basis.startsWith(PRICING_UNAVAILABLE);
}

/** True when any stage is unpriced, so the total undercounts and must not be shown as a price. */
export function isEstimateUnknown(estimate: Pick<CostEstimate, 'lines'>): boolean {
  return estimate.lines.some(isUnpricedLine);
}

/** The narration stage's price, or null when it cannot be priced. */
export function narrationUsd(estimate: Pick<CostEstimate, 'lines'>): number | null {
  const line = estimate.lines.find((entry) => entry.stage === 'narrate');
  if (line === undefined || isUnpricedLine(line)) return null;
  return line.usd;
}
