import { formatCountdown, remainingMs } from './waiting-state';

describe('remainingMs', () => {
  it('is the time left until the retry', () => {
    expect(remainingMs(10_000, 4_000)).toBe(6_000);
  });

  it('never goes negative once the retry is due', () => {
    expect(remainingMs(10_000, 12_000)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatCountdown(42_000)).toBe('0:42');
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(600_000)).toBe('10:00');
  });

  it('rounds up, so a pending retry never reads 0:00', () => {
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(4_001)).toBe('0:05');
  });

  it('reads 0:00 only when nothing is left', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-500)).toBe('0:00');
  });
});
