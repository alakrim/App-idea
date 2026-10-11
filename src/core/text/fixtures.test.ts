/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildChapterText } from './build';
import { MAX_SENTENCE_CHARS } from './fragments';
import { normalizeWhitespace } from './normalize';
import { estimateSentenceOffsets } from './timing';

import type { ChapterText } from './build';
import type { SegmentOptions } from './segment';

const FIXTURE_DIR = join(__dirname, '__fixtures__');
const LANGUAGE_BY_FIXTURE: Readonly<Record<string, string>> = {
  'en-dialogue': 'en',
  'it-racconto': 'it',
  'pt-br-conto': 'pt-BR',
  'zh-web-novel': 'zh-Hans',
  'ja-nikki': 'ja',
  'ko-chapter': 'ko',
};

/** Native-refined mode runs Intl.Segmenter when Node provides it. Rules mode forces the splitter. */
const MODES: readonly { name: string; options: SegmentOptions }[] = [
  { name: 'native-refined', options: {} },
  { name: 'rules only', options: { segmenter: null } },
];

function loadChapter(name: string, options: SegmentOptions): ChapterText {
  const raw = readFileSync(join(FIXTURE_DIR, `${name}.txt`), 'utf8');
  return buildChapterText(raw, LANGUAGE_BY_FIXTURE[name], options);
}

function sentenceTexts(chapter: ChapterText): string[] {
  return chapter.sentences.map((sentence) => sentence.text);
}

const stripWhitespace = (text: string): string => text.replace(/\s/gu, '');

describe.each(MODES)('fixture chapters ($name)', ({ options }) => {
  describe.each(Object.keys(LANGUAGE_BY_FIXTURE))('%s', (name) => {
    const chapter = loadChapter(name, options);

    it('has sentences whose concatenation equals each paragraph, modulo whitespace', () => {
      for (const paragraph of chapter.paragraphs) {
        const joined = chapter.sentences
          .slice(paragraph.sentenceStart, paragraph.sentenceEnd)
          .map((sentence) => sentence.text)
          .join('');
        expect(stripWhitespace(joined)).toBe(stripWhitespace(paragraph.text));
      }
    });

    it('has no empty sentence and no sentence longer than the 400-character limit', () => {
      for (const sentence of chapter.sentences) {
        expect(sentence.text).toBe(normalizeWhitespace(sentence.text));
        expect(sentence.text.length).toBeGreaterThan(0);
        expect(sentence.text.length).toBeLessThanOrEqual(MAX_SENTENCE_CHARS);
      }
    });

    it('gives offsets that are monotonic, start at zero and stay below the total', () => {
      const total = 600_000;
      const offsets = estimateSentenceOffsets(sentenceTexts(chapter), total);
      expect(offsets).toHaveLength(chapter.sentences.length);
      expect(offsets[0]).toBe(0);
      for (let i = 1; i < offsets.length; i += 1) {
        expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1] ?? 0);
      }
      for (const offset of offsets) expect(offset).toBeLessThan(total);
    });
  });

  it('keeps the expected paragraph kinds in each chapter', () => {
    const kinds = (name: string): string[] =>
      loadChapter(name, options).paragraphs.map((paragraph) => paragraph.kind);
    expect(kinds('en-dialogue')[0]).toBe('heading');
    expect(kinds('it-racconto')[0]).toBe('heading');
    expect(kinds('pt-br-conto')[0]).toBe('heading');
    expect(kinds('zh-web-novel')[0]).toBe('heading');
    expect(kinds('ja-nikki')[0]).toBe('heading');
    expect(kinds('ko-chapter')[0]).toBe('heading');
    expect(kinds('zh-web-novel')).toContain('dialogue');
    expect(kinds('ja-nikki')).toContain('dialogue');
  });
});

describe('fixture spot checks', () => {
  const rules = { segmenter: null } as const;

  it('English: abbreviations, initials, decimals and ellipses stay correct', () => {
    const sentences = sentenceTexts(loadChapter('en-dialogue', rules));
    expect(sentences).toContain(
      "Mr. Hollis stood at the window of the old post office on St. Mary's Road, watching the lamps flicker along Dr. Pell's garden wall.",
    );
    expect(sentences).toContain('"It is nearly nine o\'clock."');
    expect(sentences).toContain('"I... I don\'t know," she said.');
    expect(sentences).toContain('J. R. Okafor, the solicitor, had written the letter himself.');
    expect(sentences).toContain('See www.example.org/estate-notes.');
    expect(sentences).toContain(
      'The inventory listed 3.14 tons of coal, two lamps, e.g. the brass ones, and a cart, i.e. the one with the broken wheel, etc. None of it was worth much.',
    );
  });

  it('Italian: dialogue dashes split at speech turns but not at dialogue tags', () => {
    const sentences = sentenceTexts(loadChapter('it-racconto', rules));
    expect(sentences).toContain("— Chi c'è là fuori? — chiese il figlio, senza alzarsi dal letto.");
    expect(sentences).toContain("— Il Dott. Ferri passa sempre a quest'ora, con il cane.");
    expect(sentences).toContain('«Non fidarti di lui», disse la vecchia Teresa, mettendo le mani in tasca.');
  });

  it('Brazilian Portuguese: honorifics and the URL end at the right places', () => {
    const sentences = sentenceTexts(loadChapter('pt-br-conto', rules));
    expect(sentences).toContain('O Dr. Pereira, o contador, tinha escrito a carta pessoalmente.');
    expect(sentences).toContain('Veja o site www.exemplo.com.br/contas.');
    expect(sentences).toContain('“Eu... eu não sei”, disse ela.');
  });

  it('Simplified Chinese: curly-quote dialogue closes before the narration', () => {
    const sentences = sentenceTexts(loadChapter('zh-web-novel', rules));
    expect(sentences).toContain('“你还不走吗？”');
    expect(sentences).toContain('身后传来一个沙哑的声音。');
    expect(sentences).toContain('“再等等。”');
    expect(sentences).toContain('（本章完）');
  });

  it('Japanese: 「」 quotations keep their brackets and the dash-free dialogue splits', () => {
    const sentences = sentenceTexts(loadChapter('ja-nikki', rules));
    expect(sentences).toContain('「行くぞ！」');
    expect(sentences).toContain('そして歩き出した？');
    expect(sentences).toContain('「それは本当なの？ 本当に、あの人が書いたの？」');
    expect(sentences).toContain('……聞いているよ。');
  });

  it('Korean: sentences end at the ASCII period and short fragments merge into their neighbour', () => {
    const sentences = sentenceTexts(loadChapter('ko-chapter', rules));
    expect(sentences).toContain('“무슨 뜻이야?”');
    expect(sentences).toContain('편지에는 간단한 문장 하나만 적혀 있었다. 기다리지 마라.');
    expect(sentences).toContain('그녀는 대답하지 않았다.');
  });

  it('the native-refined mode gives the same Latin dialogue splits as the rules', () => {
    const native = sentenceTexts(loadChapter('it-racconto', {}));
    expect(native).toContain("— Chi c'è là fuori? — chiese il figlio, senza alzarsi dal letto.");
    expect(native).toContain("— Il Dott. Ferri passa sempre a quest'ora, con il cane.");
  });
});
