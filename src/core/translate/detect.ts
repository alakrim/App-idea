import type { Lang } from '../domain';

/**
 * A cheap language guess to prefill the source language. It is not a classifier.
 *
 * Script first. If CJK letters (Han, kana, Hangul) are at least as numerous as Latin letters, the
 * text is read as CJK: two or more Hangul and no kana mean Korean, two or more kana mean Japanese,
 * and otherwise Han text is Chinese, with Simplified or Traditional chosen by a sample of
 * characters that exist in only one of the two. Any other text is read as Latin. Its words are
 * matched against small stopword lists for en, it, es, pt, fr and de. The best language must have
 * at least 3 hits and at least 1.5 times the next best.
 *
 * Limits: it returns `null` for anything else, such as Cyrillic or Arabic. Short texts, text with
 * few stopwords, and mixed-language text often come back `null`. Spanish and Portuguese share
 * vocabulary, so the lists use only the words that differ. A Han-only text with no
 * discriminating characters returns `null`. The Latin result is the base language (`pt`, not
 * `pt-BR`). The user can always correct the prefill.
 */
export function guessLanguage(text: string): Lang | null {
  const han = countMatches(text, HAN);
  const kana = countMatches(text, KANA);
  const hangul = countMatches(text, HANGUL);
  const latin = countMatches(text, LATIN);
  const cjk = han + kana + hangul;
  if (cjk + latin === 0) return null;
  if (cjk >= latin) return guessCjk(text, { han, kana, hangul });
  return guessLatin(text);
}

const HAN = /\p{Script=Han}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const HANGUL = /\p{Script=Hangul}/gu;
const LATIN = /\p{Script=Latin}/gu;

/** Characters that appear only in Simplified Chinese (their Traditional form differs). */
const SIMPLIFIED_ONLY = new Set([
  ...'们这说为个来时国对会发后学写书开门东车见长马实问进过还没样现点经应当从无听将头气爱乐动风飞鸟龙云',
]);
/** Characters that appear only in Traditional Chinese. */
const TRADITIONAL_ONLY = new Set([
  ...'們這說為個來時國對會發後學寫書開門東車見長馬實問進過還沒樣現點經應當從無聽將頭氣愛樂動風飛鳥龍雲',
]);
const CHINESE_SAMPLE = 2000;

/** Stopwords that are distinctive for each language. Words shared with another list are left out. */
const LATIN_STOPWORDS: readonly { readonly lang: Lang; readonly words: ReadonlySet<string> }[] = [
  {
    lang: 'en',
    words: new Set([
      'the',
      'and',
      'of',
      'to',
      'is',
      'was',
      'that',
      'with',
      'you',
      'he',
      'she',
      'they',
      'had',
      'have',
      'not',
      'but',
      'this',
      'were',
      'from',
      'said',
      'which',
      'her',
      'his',
      'are',
    ]),
  },
  {
    lang: 'it',
    words: new Set([
      'il',
      'di',
      'che',
      'non',
      'per',
      'sono',
      'della',
      'gli',
      'anche',
      'questo',
      'questa',
      'nel',
      'lui',
      'lei',
      'ma',
      'degli',
      'alla',
      'delle',
      'hanno',
      'perché',
    ]),
  },
  {
    lang: 'es',
    words: new Set([
      'los',
      'las',
      'del',
      'pero',
      'muy',
      'también',
      'fue',
      'porque',
      'sus',
      'este',
      'ellos',
      'había',
      'esta',
      'nosotros',
    ]),
  },
  {
    lang: 'pt',
    words: new Set([
      'não',
      'uma',
      'são',
      'também',
      'você',
      'ele',
      'ela',
      'dos',
      'das',
      'pelo',
      'pela',
      'muito',
      'isso',
      'foi',
      'seu',
      'com',
    ]),
  },
  {
    lang: 'fr',
    words: new Set([
      'les',
      'des',
      'est',
      'une',
      'pour',
      'dans',
      'avec',
      'sont',
      'pas',
      'vous',
      'nous',
      'elle',
      'qui',
      'du',
      'ce',
      'je',
      'ne',
    ]),
  },
  {
    lang: 'de',
    words: new Set([
      'der',
      'die',
      'und',
      'das',
      'ist',
      'nicht',
      'ein',
      'eine',
      'mit',
      'sich',
      'auf',
      'für',
      'dem',
      'den',
      'zu',
      'auch',
      'von',
      'wir',
      'ich',
      'er',
      'sie',
    ]),
  },
];

const MIN_LATIN_HITS = 3;
const MIN_LEAD_RATIO = 1.5;

function guessCjk(
  text: string,
  counts: { readonly han: number; readonly kana: number; readonly hangul: number },
): Lang | null {
  if (counts.hangul >= 2 && counts.hangul >= counts.kana) return 'ko';
  if (counts.kana >= 2) return 'ja';
  if (counts.han >= 2) return guessChineseVariant(text);
  return null;
}

function guessChineseVariant(text: string): Lang | null {
  let simplified = 0;
  let traditional = 0;
  let seen = 0;
  for (const ch of text) {
    if (seen >= CHINESE_SAMPLE) break;
    seen += 1;
    if (SIMPLIFIED_ONLY.has(ch)) simplified += 1;
    else if (TRADITIONAL_ONLY.has(ch)) traditional += 1;
  }
  if (simplified === traditional) return null;
  return simplified > traditional ? 'zh-Hans' : 'zh-Hant';
}

function guessLatin(text: string): Lang | null {
  const scores = new Map<Lang, number>(LATIN_STOPWORDS.map(({ lang }) => [lang, 0]));
  for (const word of text.toLowerCase().split(/[^\p{L}]+/u)) {
    if (!word) continue;
    for (const { lang, words } of LATIN_STOPWORDS) {
      if (words.has(word)) scores.set(lang, (scores.get(lang) ?? 0) + 1);
    }
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  if (!best || best[1] < MIN_LATIN_HITS || best[1] < MIN_LEAD_RATIO * second) return null;
  return best[0];
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}
