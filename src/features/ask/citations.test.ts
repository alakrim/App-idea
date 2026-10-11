import { isNotRevealedAnswer, citedChapterNumbers, splitAnswer } from './citations';

describe('splitAnswer', () => {
  it('splits prose and citation markers in reading order', () => {
    expect(splitAnswer('Wen trained him (Ch. 1). He left later (Ch. 2).')).toEqual([
      { kind: 'text', text: 'Wen trained him ' },
      { kind: 'cite', chapterNumber: 1 },
      { kind: 'text', text: '. He left later ' },
      { kind: 'cite', chapterNumber: 2 },
      { kind: 'text', text: '.' },
    ]);
  });

  it('expands a list of chapters into one citation each', () => {
    expect(splitAnswer('Both (Ch. 3, 5)')).toEqual([
      { kind: 'text', text: 'Both ' },
      { kind: 'cite', chapterNumber: 3 },
      { kind: 'cite', chapterNumber: 5 },
    ]);
  });

  it('leaves malformed markers as plain text', () => {
    expect(splitAnswer('Unclear (Ch. x) and (Ch 4)')).toEqual([
      { kind: 'text', text: 'Unclear (Ch. x) and (Ch 4)' },
    ]);
  });

  it('returns a single text part when there are no markers', () => {
    expect(splitAnswer('Not revealed yet.')).toEqual([{ kind: 'text', text: 'Not revealed yet.' }]);
  });
});

describe('citedChapterNumbers', () => {
  it('returns distinct numbers in first-cited order', () => {
    expect(citedChapterNumbers('A (Ch. 4). B (Ch. 2, 4). C (Ch. 1).')).toEqual([4, 2, 1]);
  });

  it('returns nothing when the answer cites no chapter', () => {
    expect(citedChapterNumbers('No citation here.')).toEqual([]);
  });
});

describe('not-revealed answers carry no citations', () => {
  it('detects the not-revealed wording, with or without "been"', () => {
    expect(isNotRevealedAnswer('That has not been revealed yet.')).toBe(true);
    expect(isNotRevealedAnswer('It is not revealed yet (Ch. 4).')).toBe(true);
    expect(isNotRevealedAnswer('The duke rides north (Ch. 2).')).toBe(false);
  });

  it('returns no cited chapters for a not-revealed answer, even one with a stray marker', () => {
    expect(citedChapterNumbers('That has not been revealed yet (Ch. 4).')).toEqual([]);
    expect(citedChapterNumbers('The duke rides north (Ch. 2).')).toEqual([2]);
  });
});
