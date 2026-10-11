import { resultHeadline, valueLines, valueText } from './format';

describe('diagnostics value formatting', () => {
  it('shows scalars as they are, null as none, and objects as JSON', () => {
    expect(valueText('ok')).toBe('ok');
    expect(valueText(42)).toBe('42');
    expect(valueText(false)).toBe('false');
    expect(valueText(null)).toBe('none');
    expect(valueText({ gbk: 'pass' })).toBe('{"gbk":"pass"}');
  });

  it('lists each value under its key', () => {
    expect(valueLines({ version: '3.50.4', matched: 1 })).toEqual([
      { key: 'version', text: '3.50.4' },
      { key: 'matched', text: '1' },
    ]);
  });

  it('uses the message as the headline, and counts values when there is none', () => {
    const base = { id: 'a', group: 'storage' as const, label: 'A', status: 'pass' as const, durationMs: 1 };
    expect(resultHeadline({ ...base, values: {}, message: 'Not decoded: big5.' })).toBe(
      'Not decoded: big5.',
    );
    expect(resultHeadline({ ...base, values: { a: 1 }, message: null })).toBe('1 value recorded');
    expect(resultHeadline({ ...base, values: {}, message: null })).toBe('');
  });
});
