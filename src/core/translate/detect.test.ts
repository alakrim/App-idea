/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import { guessLanguage } from './detect';

const FIXTURE_DIR = join(__dirname, '../text/__fixtures__');

describe('guessLanguage on the text fixtures', () => {
  it.each([
    ['en-dialogue', 'en'],
    ['it-racconto', 'it'],
    ['pt-br-conto', 'pt'],
    ['zh-web-novel', 'zh-Hans'],
    ['ja-nikki', 'ja'],
    ['ko-chapter', 'ko'],
  ])('%s is guessed as %s', (name, expected) => {
    const text = readFileSync(join(FIXTURE_DIR, `${name}.txt`), 'utf8');
    expect(guessLanguage(text)).toBe(expected);
  });
});

describe('guessLanguage on short samples', () => {
  it.each([
    [
      'en',
      'The rain did not stop for the whole night, and the old man was waiting for his son to come home.',
    ],
    [
      'it',
      'La pioggia non smetteva di cadere e il vecchio era seduto alla finestra, perché aspettava che il figlio tornasse.',
    ],
    [
      'es',
      'La lluvia no paraba y el viejo estaba sentado junto a la ventana, porque los niños, muy cansados, también habían vuelto y sus madres las esperaban.',
    ],
    [
      'pt',
      'A chuva não parava e o velho estava sentado na janela, porque os meninos ainda não tinham voltado, e ele também estava muito cansado.',
    ],
    [
      'fr',
      "La pluie ne s'arrêtait pas et le vieil homme était assis près de la fenêtre, parce que les enfants n'étaient pas encore rentrés avec les autres.",
    ],
    [
      'de',
      'Der Regen hörte die ganze Nacht nicht auf, und der alte Mann saß am Fenster, weil die Kinder mit den anderen noch nicht nach Hause gekommen waren.',
    ],
    ['zh-Hans', '这些人说，我们要去国外，这个国家的门很大。'],
    ['zh-Hant', '這些人說，我們要去國外，這個國家的門很大。'],
    ['ja', '今日は雨が降っていて、私は本を読みました。'],
    ['ko', '오늘은 비가 오래 내렸고 우리는 집에 있었다.'],
  ] as const)('recognises %s', (expected, sample) => {
    expect(guessLanguage(sample)).toBe(expected);
  });
});

describe('guessLanguage declines to guess', () => {
  it.each([
    ['empty text', ''],
    ['only whitespace and digits', '   123  '],
    [
      'Cyrillic, which is not in the supported set',
      'Дождь не прекращался всю ночь, и старик ждал сына.',
    ],
    ['too few stopwords to be sure', 'Ciao, come stai? Bene.'],
    ['English-looking names only', 'Mara Oss. Torvald. Ada Vellani.'],
    ['Han text with no discriminating characters', '山水田林'],
    ['a single Han character', '山'],
  ])('returns null for %s', (_label, sample) => {
    expect(guessLanguage(sample)).toBeNull();
  });

  it('returns the base language for Portuguese, never a regional tag', () => {
    expect(guessLanguage('A chuva não parava e os meninos também estavam muito cansados.')).toBe(
      'pt',
    );
  });
});
