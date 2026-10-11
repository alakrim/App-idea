import { describeDuration, formatClock, formatRate, formatRemaining } from './format';

describe('formatClock', () => {
  it('formats minutes and seconds with a padded seconds field', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_900)).toBe('1:05');
    expect(formatClock(59_999)).toBe('0:59');
  });

  it('switches to hours from one hour on', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('clamps negative input to zero', () => {
    expect(formatClock(-4000)).toBe('0:00');
  });
});

describe('formatRemaining', () => {
  it('prefixes a typographic minus sign', () => {
    expect(formatRemaining(252_000)).toBe('−4:12');
  });
});

describe('formatRate', () => {
  it('keeps the 0.05 steps and drops a trailing zero', () => {
    expect(formatRate(1)).toBe('1.0×');
    expect(formatRate(2)).toBe('2.0×');
    expect(formatRate(1.25)).toBe('1.25×');
    expect(formatRate(0.5)).toBe('0.5×');
  });
});

describe('describeDuration', () => {
  it('spells out units for screen readers', () => {
    expect(describeDuration(754_000)).toBe('12 minutes 34 seconds');
    expect(describeDuration(3_600_000)).toBe('1 hour 0 minutes 0 seconds');
    expect(describeDuration(1000)).toBe('1 second');
  });
});
