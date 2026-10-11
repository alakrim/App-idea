import { LEXICON_RULES, matchRule } from './lexicon';
import { measureUnits } from './text-metrics';

describe('LEXICON_RULES table', () => {
  it('uses unique snake_case ids', () => {
    const ids = LEXICON_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('covers every language the brief names for navigation', () => {
    const navIds = LEXICON_RULES.filter((rule) => rule.kind === 'nav').map((rule) => rule.id);
    for (const language of ['en', 'zh', 'ja', 'ko', 'pt', 'it', 'es', 'fr', 'de']) {
      expect(navIds).toContain(`nav_next_prev_${language}`);
    }
  });

  it.each(LEXICON_RULES.map((rule) => [rule.id, rule] as const))(
    '%s matches each of its own examples under its length cap',
    (_id, rule) => {
      expect(rule.examples.length).toBeGreaterThan(0);
      for (const example of rule.examples) {
        expect(rule.pattern.test(example)).toBe(true);
        expect(measureUnits(example)).toBeLessThan(rule.maxUnits);
      }
    },
  );
});

describe('matchRule', () => {
  it.each([
    ['Share this on Facebook', 'share_prompt'],
    ['Advertisement', 'ad_label'],
    ['Next chapter →', 'nav_next_prev_en'],
    ['下一章', 'nav_next_prev_zh'],
    ['次へ', 'nav_next_prev_ja'],
    ['다음 화', 'nav_next_prev_ko'],
    ['Próximo capítulo', 'nav_next_prev_pt'],
    ['Capitolo successivo', 'nav_next_prev_it'],
    ['Siguiente capítulo', 'nav_next_prev_es'],
    ['Chapitre suivant', 'nav_next_prev_fr'],
    ['Nächstes Kapitel', 'nav_next_prev_de'],
    ['目次', 'nav_toc'],
    ['Related articles', 'related_links'],
    ['Leave a reply', 'comments_prompt'],
    ['We use cookies to improve your experience.', 'cookie_notice'],
    ['Support me on Patreon!', 'donation_note'],
    ['求月票！', 'donation_note'],
    ['By Aleks Phillips', 'byline_prefix'],
    ['19 hours ago', 'timestamp_relative'],
    ['Published Oct 11, 2026', 'timestamp_absolute'],
  ])('classifies "%s" as %s', (text, expectedId) => {
    expect(matchRule(text, measureUnits(text))?.id).toBe(expectedId);
  });

  it.each([
    'She closed the door and did not look back at the house.',
    'I read more books that winter than I ever had before.',
    'We share this story with our friends at the market.',
    'He had no time to comment on it.',
    'Published 2 books last year, to small crowds.',
    'Accept the offer, she said, and turned away.',
    'Support me, she whispered, and took his hand.',
    'The cookies were still warm from the oven.',
    'He had lived in Dublin since 1998.',
    '他走进房间，看见桌上放着一封信。',
    '彼女は窓の外を見つめていた。',
    '그는 천천히 고개를 들었다.',
  ])('keeps narrative text: %s', (text) => {
    expect(matchRule(text, measureUnits(text))).toBeNull();
  });

  it('does not fire a rule on a block at or above its length cap', () => {
    const long =
      'The next chapter of their lives began on a grey morning, when the letter arrived at the ' +
      'old farmhouse and everything they had believed about the village, the river, and the ' +
      'family who had lived there for three generations suddenly changed for ever and forced ' +
      'them to leave the only home they had ever known.';
    expect(measureUnits(long)).toBeGreaterThan(40);
    expect(matchRule(long, measureUnits(long))).toBeNull();
  });
});
