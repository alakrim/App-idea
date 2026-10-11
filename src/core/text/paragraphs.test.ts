import { toParagraphs } from './paragraphs';

const kinds = (text: string): string[] => toParagraphs(text).map((block) => block.kind);

describe('toParagraphs: splitting', () => {
  it('returns no paragraphs for empty input', () => {
    expect(toParagraphs('')).toEqual([]);
    expect(toParagraphs(' \n\n \t ')).toEqual([]);
  });

  it('splits on blank lines and joins soft-wrapped lines with spaces', () => {
    const text = 'The first line wraps\nonto the second line.\n\nA new paragraph starts here.';
    expect(toParagraphs(text).map((block) => block.text)).toEqual([
      'The first line wraps onto the second line.',
      'A new paragraph starts here.',
    ]);
  });

  it('treats each line as a paragraph in CJK text', () => {
    const text = '雨下了整整一夜。\n林默站在门口。\n\n他没有回头。';
    expect(toParagraphs(text).map((block) => block.text)).toEqual([
      '雨下了整整一夜。',
      '林默站在门口。',
      '他没有回头。',
    ]);
  });

  it('treats each line as a paragraph in novel-style text with no blank lines', () => {
    const text = 'She closed the door behind her.\nThe house was quiet again.\nNobody came.';
    expect(toParagraphs(text).map((block) => block.text)).toEqual([
      'She closed the door behind her.',
      'The house was quiet again.',
      'Nobody came.',
    ]);
  });

  it('joins hard-wrapped prose whose lines do not end sentences', () => {
    const text =
      'the rain kept falling over the\nharbour while the boats waited\nfor the tide to turn';
    expect(toParagraphs(text)).toHaveLength(1);
  });

  it('normalises invisible characters and whitespace in paragraph text', () => {
    expect(toParagraphs('A​  quiet  room.')[0]?.text).toBe('A quiet room.');
  });
});

describe('toParagraphs: heading detection', () => {
  it.each([
    'Chapter 3',
    'Chapter Three',
    'CHAPTER ONE',
    'Chapter 12: The Storm',
    'Capítulo 7',
    'Capitolo primo',
    'Prologue',
    '第一章 风起云涌',
    '第三十二章 夜雨',
    '第一話　雨の日',
    '제1장 시작',
    '1화 시작',
    '序章',
    'The Long Road Home',
  ])('classifies "%s" as a heading', (line) => {
    expect(kinds(line)).toEqual(['heading']);
  });

  it.each([
    'Chapter 4 was the worst.',
    'the rain kept falling.',
    'Hello there, my friend',
    'Yes.',
    '他没有回头，',
    'この道を行くと海が見える。',
  ])('does not classify "%s" as a heading', (line) => {
    expect(kinds(line)).not.toEqual(['heading']);
  });

  it('does not classify a long Title-Case-looking line as a heading', () => {
    const line = `${'Word '.repeat(30).trim()}`;
    expect(kinds(line)).not.toEqual(['heading']);
  });
});

describe('toParagraphs: dialogue, quote and text', () => {
  it.each([
    ['"You should go home," said Mrs. Hollis.'],
    ['“你还不走吗？”身后传来一个沙哑的声音。'],
    ['«Non fidarti di lui», disse la vecchia Teresa.'],
    ['「もう帰ろう。」'],
    ['『再见』他说。'],
    ['— Ciao, disse lui.'],
    ['„Guten Tag“, sagte er.'],
  ])('classifies %s as dialogue', (line) => {
    expect(kinds(line)).toEqual(['dialogue']);
  });

  it('classifies a block quotation with an attribution as a quote', () => {
    expect(kinds('“To be, or not to be.” — William Shakespeare')).toEqual(['quote']);
  });

  it('keeps a quoted paragraph followed by narration as dialogue', () => {
    expect(kinds('"Hi," she said.')).toEqual(['dialogue']);
  });

  it('classifies a Japanese 「」 paragraph with two sentences as dialogue, not quote', () => {
    expect(kinds('「それは本当なの？本当に、あの人が書いたの？」')).toEqual(['dialogue']);
  });

  it('classifies plain narration as text', () => {
    expect(kinds('The rain had not stopped since Tuesday.')).toEqual(['text']);
  });

  it('gives each block its own kind in a mixed chapter', () => {
    const text = [
      'Chapter 3',
      '',
      'The rain had not stopped since Tuesday.',
      '',
      '"You should go home," said Mrs. Hollis.',
    ].join('\n');
    expect(kinds(text)).toEqual(['heading', 'text', 'dialogue']);
  });
});
