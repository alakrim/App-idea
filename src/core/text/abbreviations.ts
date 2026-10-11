/**
 * Abbreviations whose trailing period does not end a sentence, lower-cased and without the dot.
 * Grouped by language, but matched against one set: the sets are small and do not collide.
 */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  // English
  'mr',
  'mrs',
  'ms',
  'mx',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'mt',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'cf',
  'approx',
  'dept',
  'est',
  'inc',
  'ltd',
  'co',
  'corp',
  'gen',
  'col',
  'capt',
  'lt',
  'sgt',
  'rev',
  'hon',
  'gov',
  'sen',
  'rep',
  'vol',
  'fig',
  'ch',
  'a.m',
  'p.m',
  'jan',
  'feb',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  // Portuguese
  'sra',
  'srta',
  'dra',
  'profa',
  'av',
  'pág',
  'pag',
  'págs',
  'cap',
  'ex',
  'obs',
  'tel',
  'cia',
  'ltda',
  'ud',
  'uds',
  // Italian
  'sig',
  'sigg',
  'sig.ra',
  'dott',
  'dott.ssa',
  'ing',
  'avv',
  'arch',
  'ecc',
  'es',
  'pagg',
  'ss',
  'sigra',
]);

/** Text immediately before a period, without leading brackets or quotes: `"Mr` -> `Mr`. */
function lastToken(before: string): string {
  const match = /(\S+)$/u.exec(before);
  return match?.[1]?.replace(/^[("'“‘«「『[]+/u, '') ?? '';
}

/**
 * True when the period that follows `before` does not end a sentence: a known abbreviation
 * (`Mr.`, `Sra.`, `e.g.`), a single initial (`J.`) or an acronym (`U.S.`). Periods inside a
 * URL never reach this check because no whitespace follows them.
 */
export function isNonTerminalPeriod(before: string): boolean {
  const token = lastToken(before);
  if (token === '') return false;
  if (/^\p{Lu}$/u.test(token)) return true;
  if (/^(?:\p{Lu}\.)+\p{Lu}$/u.test(token)) return true;
  return ABBREVIATIONS.has(token.toLowerCase());
}
