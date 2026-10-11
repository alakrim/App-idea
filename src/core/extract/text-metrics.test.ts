import { endsSentence, exactKey, measureUnits, shapeKey } from './text-metrics';

describe('measureUnits', () => {
  it('counts each Latin word as one unit', () => {
    expect(measureUnits('Hello brave new world')).toBe(4);
  });

  it('counts each CJK character as half a unit', () => {
    expect(measureUnits('東京タワー')).toBe(2.5);
    expect(measureUnits('안녕하세요')).toBe(2.5);
    expect(measureUnits('ตัวอย่าง')).toBe(4);
  });

  it('adds Latin words and CJK characters together', () => {
    expect(measureUnits('Hello 世界')).toBe(2);
  });

  it('does not count punctuation or ideographic punctuation', () => {
    expect(measureUnits('— — !')).toBe(0);
    expect(measureUnits('。、「」')).toBe(0);
  });

  it('returns 0 for empty text', () => {
    expect(measureUnits('')).toBe(0);
  });

  it('counts 1275 CJK characters as 637.5 units, the size of the JP prologue fixture', () => {
    expect(measureUnits('あ'.repeat(1275))).toBe(637.5);
  });
});

describe('endsSentence', () => {
  it('accepts Latin and CJK terminal punctuation', () => {
    expect(endsSentence('It rained.')).toBe(true);
    expect(endsSentence('他说完了。')).toBe(true);
    expect(endsSentence('本当に行くのか？')).toBe(true);
  });

  it('accepts a sentence that closes a quotation', () => {
    expect(endsSentence('“Yes.”')).toBe(true);
    expect(endsSentence('「はい。」')).toBe(true);
  });

  it('ignores trailing spaces', () => {
    expect(endsSentence('Done!   ')).toBe(true);
  });

  it('rejects text without a terminal character', () => {
    expect(endsSentence('Share this on Facebook')).toBe(false);
    expect(endsSentence('')).toBe(false);
  });
});

describe('exactKey and shapeKey', () => {
  it('lowercases and collapses whitespace but keeps digits in exactKey', () => {
    expect(exactKey('  Chapter   12 ')).toBe('chapter 12');
    expect(exactKey('Chapter 12')).not.toBe(exactKey('Chapter 1'));
  });

  it('drops digits in shapeKey so numbered variants match', () => {
    expect(shapeKey('Part 2')).toBe(shapeKey('Part 3'));
  });
});
