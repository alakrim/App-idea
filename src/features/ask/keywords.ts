import { normalizeName } from '@/core/memory/entities';

/** Full-text queries stay short: every extra term narrows the match with AND. */
export const MAX_QUESTION_KEYWORDS = 4;

/** Function words and question words. They never make a useful search term. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'about',
  'again',
  'also',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'could',
  'did',
  'does',
  'do',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'into',
  'its',
  'just',
  'me',
  'more',
  'not',
  'now',
  'of',
  'on',
  'once',
  'one',
  'or',
  'our',
  'out',
  'over',
  'said',
  'she',
  'should',
  'so',
  'some',
  'tell',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'too',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;
const MIN_TOKEN_LENGTH = 3;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `needle` appears in `haystack` as whole words (or anywhere, for CJK text). */
function containsPhrase(haystack: string, needle: string): boolean {
  if (CJK.test(needle)) return haystack.includes(needle);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}($|[^\\p{L}\\p{N}])`, 'u').test(
    haystack,
  );
}

/**
 * Search terms for one question, with no LLM call. Known names from the codex come first, because
 * they are the most specific. Other words follow in question order, with stopwords, short words and
 * words that already belong to a name removed. The result is normalized the same way as the index
 * matches, so it works with the text search.
 */
export function extractKeywords(
  question: string,
  names: readonly string[],
  limit: number = MAX_QUESTION_KEYWORDS,
): string[] {
  const normalizedQuestion = normalizeName(question);
  const keywords: string[] = [];
  const covered = new Set<string>();

  const knownNames = [...new Set(names.map(normalizeName).filter((n) => n.length >= 2))]
    .filter((name) => containsPhrase(normalizedQuestion, name))
    .sort((a, b) => b.length - a.length);
  for (const name of knownNames) {
    if (keywords.length >= limit) break;
    // Skip a name that sits inside a longer one already chosen ("lin" inside "lin mo").
    if ([...covered].some((c) => c.includes(name))) continue;
    keywords.push(name);
    for (const word of name.split(' ')) covered.add(word);
    covered.add(name);
  }

  for (const token of normalizedQuestion.split(TOKEN_SPLIT)) {
    if (keywords.length >= limit) break;
    if (CJK.test(token)) continue;
    if (token.length < MIN_TOKEN_LENGTH || STOPWORDS.has(token) || covered.has(token)) continue;
    if (keywords.includes(token)) continue;
    keywords.push(token);
  }
  return keywords;
}
