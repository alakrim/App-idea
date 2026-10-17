import type { CostLine } from '@/features/pipeline/facade';

import { isEstimateUnknown, isUnpricedLine, narrationUsd } from './estimate-price';

const priced = (stage: CostLine['stage'], usd: number): CostLine => ({
  stage,
  usd,
  basis: '1200 input and 300 output tokens',
});
const unpriced = (stage: CostLine['stage']): CostLine => ({
  stage,
  usd: 0,
  basis: `pricing unavailable for vendor/removed`,
});

describe('unpriced stages', () => {
  it('treats a $0 line with the pricing-unavailable basis as unknown, not free', () => {
    expect(isUnpricedLine(unpriced('narrate'))).toBe(true);
    expect(isUnpricedLine(priced('narrate', 0))).toBe(false);
    expect(isUnpricedLine(priced('narrate', 0.04))).toBe(false);
  });

  it('marks the whole estimate unknown when any stage is unpriced', () => {
    expect(isEstimateUnknown({ lines: [priced('clean', 0.01), unpriced('analyze')] })).toBe(true);
    expect(isEstimateUnknown({ lines: [priced('clean', 0.01), priced('narrate', 0.2)] })).toBe(
      false,
    );
  });
});

describe('narrationUsd', () => {
  it('returns the narration stage price', () => {
    expect(narrationUsd({ lines: [priced('clean', 0.01), priced('narrate', 0.27)] })).toBe(0.27);
  });

  it('returns null when narration is unpriced or missing', () => {
    expect(narrationUsd({ lines: [unpriced('narrate')] })).toBeNull();
    expect(narrationUsd({ lines: [priced('clean', 0.01)] })).toBeNull();
  });
});
