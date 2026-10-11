import { splitByRules } from './rule-split';

describe('splitByRules: Latin', () => {
  it('splits on terminator, space and a capital letter', () => {
    expect(splitByRules('The rain fell. The river rose! Did it stop?')).toEqual([
      'The rain fell.',
      'The river rose!',
      'Did it stop?',
    ]);
  });

  it('does not split before a lower-case word', () => {
    expect(splitByRules('It was late. and cold.')).toEqual(['It was late. and cold.']);
  });

  it('does not split before a digit', () => {
    expect(splitByRules('It was late. 3 men came.')).toEqual(['It was late. 3 men came.']);
  });

  it('keeps honorifics and common abbreviations with their sentence', () => {
    expect(splitByRules('Mr. Hollis met Dr. Pell at St. Mary.')).toEqual([
      'Mr. Hollis met Dr. Pell at St. Mary.',
    ]);
    expect(splitByRules('Sra. Costa saw Sr. Silva. He waved.')).toEqual([
      'Sra. Costa saw Sr. Silva.',
      'He waved.',
    ]);
  });

  it('keeps e.g., i.e. and etc. intact', () => {
    expect(splitByRules('Bring tools, e.g. saws, i.e. the big ones, etc. Then leave.')).toEqual([
      'Bring tools, e.g. saws, i.e. the big ones, etc.',
      'Then leave.',
    ]);
  });

  it('protects single initials and acronyms', () => {
    expect(splitByRules('J. K. Rowling wrote on. The U.S. army left.')).toEqual([
      'J. K. Rowling wrote on.',
      'The U.S. army left.',
    ]);
  });

  it('does not split decimals', () => {
    expect(splitByRules('It cost 3.14 coins. Then it rose.')).toEqual([
      'It cost 3.14 coins.',
      'Then it rose.',
    ]);
  });

  it('never splits at periods inside a URL', () => {
    expect(splitByRules('Visit www.example.org/a.b.c now. Then leave.')).toEqual([
      'Visit www.example.org/a.b.c now.',
      'Then leave.',
    ]);
  });

  it('splits after a sentence whose last word is a URL', () => {
    expect(splitByRules('See https://example.org/notes. The end.')).toEqual([
      'See https://example.org/notes.',
      'The end.',
    ]);
  });

  it('keeps a closing quote attached to the sentence it ends', () => {
    expect(splitByRules('He said "Stop." Then he ran.')).toEqual(['He said "Stop."', 'Then he ran.']);
    expect(splitByRules('He said “Stop.” Then he ran.')).toEqual(['He said “Stop.”', 'Then he ran.']);
  });

  it('splits when a new quotation opens after a sentence end', () => {
    expect(splitByRules('"Hello." "Goodbye," she said.')).toEqual(['"Hello."', '"Goodbye," she said.']);
  });

  it('does not split an ellipsis inside an open quotation', () => {
    expect(splitByRules('"I... I don\'t know," she said.')).toEqual([
      '"I... I don\'t know," she said.',
    ]);
  });

  it('splits after an ellipsis that closes the quotation', () => {
    expect(splitByRules('"Wait..." He left.')).toEqual(['"Wait..."', 'He left.']);
  });

  it('splits before an opening guillemet', () => {
    expect(splitByRules('Disse nulla. «Non fidarti di lui», disse lei.')).toEqual([
      'Disse nulla.',
      '«Non fidarti di lui», disse lei.',
    ]);
  });

  it('splits dialogue dashes that start with a capital', () => {
    expect(splitByRules('— Ciao, disse lui. — Come stai? Bene.')).toEqual([
      '— Ciao, disse lui.',
      '— Come stai?',
      'Bene.',
    ]);
  });

  it('keeps a dialogue tag that starts with a lower-case word after a dash', () => {
    expect(splitByRules("— Chi c'è? — chiese il figlio.")).toEqual([
      "— Chi c'è? — chiese il figlio.",
    ]);
  });

  it('returns no sentences for empty input and one sentence when there is no terminator', () => {
    expect(splitByRules('')).toEqual([]);
    expect(splitByRules('no terminator here')).toEqual(['no terminator here']);
  });
});

describe('splitByRules: CJK', () => {
  it('splits after the fullwidth full stop without needing a space', () => {
    expect(splitByRules('本須は言った。そして歩き出した。')).toEqual([
      '本須は言った。',
      'そして歩き出した。',
    ]);
  });

  it('keeps a Japanese quotation with its closing bracket and splits after it', () => {
    expect(splitByRules('本須は言った。「行くぞ！」そして歩き出した？')).toEqual([
      '本須は言った。',
      '「行くぞ！」',
      'そして歩き出した？',
    ]);
  });

  it('splits Chinese dialogue at the closing curly quote', () => {
    expect(splitByRules('“我们走吧！”他说。她没有动。')).toEqual([
      '“我们走吧！”',
      '他说。',
      '她没有动。',
    ]);
  });

  it('does not split inside a short quotation with an inner sentence end', () => {
    expect(splitByRules('「これは長い。それでもまだ続く。」と彼は言った。')).toEqual([
      '「これは長い。それでもまだ続く。」',
      'と彼は言った。',
    ]);
  });

  it('splits inside a long quotation when more than forty characters follow the sentence end', () => {
    const rest = `${'あ'.repeat(45)}。`;
    expect(splitByRules(`「それは長い。${rest}」`)).toEqual([
      '「それは長い。',
      `${rest}」`,
    ]);
  });

  it('splits ASCII exclamation and question marks in CJK text without a space', () => {
    expect(splitByRules('本当か?そうだ!行こう')).toEqual(['本当か?', 'そうだ!', '行こう']);
  });

  it('keeps an ASCII decimal point inside CJK text', () => {
    expect(splitByRules('價格是3.5元。Done')).toEqual(['價格是3.5元。', 'Done']);
  });

  it('splits Korean sentences that end with an ASCII period and a space', () => {
    expect(splitByRules('그는 떠났다. 그녀는 남았다. 비가 내리고 있었다.')).toEqual([
      '그는 떠났다.',
      '그녀는 남았다.',
      '비가 내리고 있었다.',
    ]);
  });
});
