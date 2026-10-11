import { formatCostEstimate, formatDuration, formatFileSize, formatSeriesSummary, formatUsd } from './format';

describe('formatDuration', () => {
  it('shows hours and minutes for long runs', () => {
    expect(formatDuration((4 * 60 + 20) * 60_000)).toBe('4 h 20 m');
  });

  it('shows minutes under an hour and rounds to the nearest minute', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 m');
    expect(formatDuration(44_000)).toBe('1 m');
    expect(formatDuration(0)).toBe('0 m');
  });
});

describe('formatSeriesSummary', () => {
  it('pluralises the chapter count', () => {
    expect(formatSeriesSummary(12, 4 * 3_600_000 + 20 * 60_000)).toBe('12 chapters · 4 h 20 m');
    expect(formatSeriesSummary(1, 0)).toBe('1 chapter · 0 m');
  });
});

describe('formatUsd and formatCostEstimate', () => {
  it('reads sub-cent amounts as a bound', () => {
    expect(formatUsd(0.002)).toBe('< $0.01');
    expect(formatUsd(0.04)).toBe('$0.04');
  });

  it('shows the total with its low and high range', () => {
    expect(formatCostEstimate({ totalUsd: 0.04, lowUsd: 0.03, highUsd: 0.06 })).toBe(
      '≈ $0.04 (0.03–0.06)',
    );
  });
});

describe('formatFileSize', () => {
  it('uses bytes, kilobytes and megabytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
