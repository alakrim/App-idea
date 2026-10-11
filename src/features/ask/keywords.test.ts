import { extractKeywords } from './keywords';

describe('extractKeywords', () => {
  it('puts known names first and drops question words and stopwords', () => {
    expect(extractKeywords("Who is Lin Mo's master again?", ['Lin Mo', 'Mo'])).toEqual([
      'lin mo',
      'master',
    ]);
  });

  it('matches names as whole words and ignores accents and case', () => {
    expect(extractKeywords('Where did Élise go?', ['Elise'])).toEqual(['elise']);
    expect(extractKeywords('Is Mona here?', ['Mo'])).toEqual(['mona', 'here']);
  });

  it('keeps the longer of two overlapping names and skips the shorter one', () => {
    expect(extractKeywords('What about Lin Mo today?', ['Lin', 'Lin Mo'])).toEqual([
      'lin mo',
      'today',
    ]);
  });

  it('drops words that already belong to a chosen name', () => {
    expect(extractKeywords('Lin Mo and Lin Mo again', ['Lin Mo'])).toEqual(['lin mo']);
  });

  it('removes words shorter than three characters', () => {
    expect(extractKeywords('Is it by the sea?', [])).toEqual(['sea']);
  });

  it('caps the number of keywords', () => {
    expect(extractKeywords('scroll temple mountain river lantern', [], 2)).toEqual([
      'scroll',
      'temple',
    ]);
  });

  it('skips CJK words, which the names handle instead', () => {
    expect(extractKeywords('林墨的师父是谁？', ['林墨'])).toEqual(['林墨']);
    expect(extractKeywords('林墨的师父是谁？', [])).toEqual([]);
  });

  it('returns nothing for a question with only stopwords', () => {
    expect(extractKeywords('what is it?', [])).toEqual([]);
  });
});
