/**
 * Boilerplate lexicon: navigation, share and comment prompts, cookie notices, donation and
 * translator notes, and bylines or timestamps. Each rule is data. A rule only fires on a block
 * shorter than its `maxUnits`, so long narrative sentences that happen to contain a word are kept.
 *
 * Rule ids are stable snake_case and are never renamed once shipped, because they appear in
 * the removal log and in stored quality data.
 */

export type LexiconKind =
  'nav' | 'share' | 'related' | 'comments' | 'cookie' | 'donation' | 'byline' | 'timestamp';

export interface LexiconRule {
  id: string;
  kind: LexiconKind;
  pattern: RegExp;
  /** Only blocks with fewer effective units than this are candidates for this rule. */
  maxUnits: number;
  /** Lines this rule must match. The lexicon test checks them, so every rule has a test. */
  examples: readonly string[];
}

const MONTHS_EN =
  'January|February|March|April|May|June|July|August|September|October|November|December';
const MONTHS_EN_SHORT = 'Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec';
const MONTHS_IT =
  'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
const MONTHS_DE =
  'Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember';

export const LEXICON_RULES: readonly LexiconRule[] = [
  // Navigation between chapters and pages.
  {
    id: 'nav_next_prev_en',
    kind: 'nav',
    pattern: /\b(?:next|prev(?:ious)?)\.?\s+(?:chapter|page|episode|post)\b/i,
    maxUnits: 40,
    examples: ['Next chapter', 'Previous Chapter →', 'Prev. page'],
  },
  {
    id: 'nav_next_prev_zh',
    kind: 'nav',
    pattern: /下一[章页頁话話]|上一[章页頁话話]/,
    maxUnits: 40,
    examples: ['下一章', '上一章', '下一页'],
  },
  {
    id: 'nav_next_prev_ja',
    kind: 'nav',
    pattern: /次へ|前へ|次章|前章|次の話|前の話|次話|前話/,
    maxUnits: 40,
    examples: ['次へ', '前へ', '次の話'],
  },
  {
    id: 'nav_next_prev_ko',
    kind: 'nav',
    pattern: /다음\s*(?:화|편|장)|이전\s*(?:화|편|장)/,
    maxUnits: 40,
    examples: ['다음 화', '이전 화', '다음편'],
  },
  {
    id: 'nav_next_prev_pt',
    kind: 'nav',
    pattern: /pr[óo]ximo\s+cap[íi]tulo|cap[íi]tulo\s+(?:anterior|pr[óo]ximo)/i,
    maxUnits: 40,
    examples: ['Próximo capítulo', 'Capítulo anterior'],
  },
  {
    id: 'nav_next_prev_it',
    kind: 'nav',
    pattern: /capitolo\s+(?:successivo|precedente|seguente)/i,
    maxUnits: 40,
    examples: ['Capitolo successivo', 'Capitolo precedente'],
  },
  {
    id: 'nav_next_prev_es',
    kind: 'nav',
    pattern: /siguiente\s+cap[íi]tulo/i,
    maxUnits: 40,
    examples: ['Siguiente capítulo'],
  },
  {
    id: 'nav_next_prev_fr',
    kind: 'nav',
    pattern: /chapitre\s+(?:suivant|pr[ée]c[ée]dent)/i,
    maxUnits: 40,
    examples: ['Chapitre suivant', 'Chapitre précédent'],
  },
  {
    id: 'nav_next_prev_de',
    kind: 'nav',
    pattern: /n(?:ä|ae)chstes\s+kapitel|vorheriges\s+kapitel/i,
    maxUnits: 40,
    examples: ['Nächstes Kapitel', 'Vorheriges Kapitel'],
  },
  {
    id: 'nav_toc',
    kind: 'nav',
    pattern:
      /目次|目录|目錄|\btable of contents\b|^\s*contents\s*$|índice|^\s*sommaire\s*$|inhaltsverzeichnis/i,
    maxUnits: 12,
    examples: ['目次', '目录', 'Table of contents', 'Contents'],
  },

  // Share and social prompts.
  {
    id: 'share_prompt',
    kind: 'share',
    // English is matched case-sensitively so narrative "share this story" in lowercase is kept.
    pattern:
      /\bShare (?:this|on|via|article|story)\b|^\s*Share\s*$|分享到|分享至|^\s*(?:分享|シェア|공유하기)\s*$/,
    maxUnits: 25,
    examples: ['Share this on Facebook', 'Share', '分享到微博', 'シェア'],
  },
  {
    id: 'social_follow',
    kind: 'share',
    pattern:
      /\bfollow us\b|\bsubscribe (?:now|to our|for)\b|sign up for (?:our )?newsletter|关注我们|フォロー|구독하기/i,
    maxUnits: 25,
    examples: ['Follow us on Twitter', 'Subscribe to our newsletter', '关注我们', 'フォロー'],
  },

  // Related links and comment prompts.
  {
    id: 'related_links',
    kind: 'related',
    // Case-sensitive English: "I read more books" in a sentence must not match "Read more".
    pattern:
      /\bRelated (?:[Aa]rticles?|[Ss]tories|[Pp]osts|[Cc]ontent|[Tt]opics|[Rr]eading)\b|\bRead [Mm]ore\b|\bMore from\b|\bYou [Mm]ay [Aa]lso [Ll]ike\b|\bRecommended for you\b|相关阅读|相关文章|相關文章|関連記事|関連作品|관련 기사/,
    maxUnits: 25,
    examples: [
      'Related articles',
      'Read more: Top 10 tips',
      'More from BBC Sport',
      '相关阅读',
      '関連記事',
    ],
  },
  {
    id: 'comments_prompt',
    kind: 'comments',
    pattern:
      /leave a (?:reply|comment)|post a comment|reply to this|^\s*(?:\d+\s+)?comments?\s*(?:\(\d+\))?\s*$|^\s*(?:评论|評論|コメント|댓글)\s*[(（:：]?\s*\d*\s*[)）]?\s*$/i,
    maxUnits: 25,
    examples: [
      'Leave a reply',
      '3 Comments',
      'Comments (12)',
      'Post a comment',
      'コメント',
      '评论 (5)',
    ],
  },

  // Cookie and consent notices.
  {
    id: 'cookie_notice',
    kind: 'cookie',
    pattern:
      /\bwe use cookies\b|\bcookie (?:policy|settings|notice|consent|preferences)\b|\baccept (?:all )?cookies\b|\baccept all\b|\bmanage (?:cookies|consent)\b|\bprivacy (?:policy|notice)\b|^\s*Accept all\b|我们使用.{0,4}cookie|쿠키|クッキー/i,
    maxUnits: 60,
    examples: [
      'We use cookies to improve your experience.',
      'Accept all',
      'Cookie settings',
      '我们使用Cookie改善体验',
      '쿠키 설정',
    ],
  },

  // Translator, author and donation notes.
  {
    id: 'donation_note',
    kind: 'donation',
    pattern:
      /patreon|ko-?fi|buy me a coffee|\bpaypal\b|\bdonat(?:e|ion|ions|ing)\b|support (?:me|us) on\b|support (?:the|my) translator\b|translator'?s? (?:note|comment)|\bTL\s*(?:note|:)|\bTN\s*:|\bA\/N\b|author'?s? (?:note|comment)|求(?:月票|推荐票|收藏|订阅|追读)|月票|推荐票|打赏|ご支援|ご感想|翻译者|译者的话|译注|作者的话|作者有话说/i,
    maxUnits: 60,
    examples: [
      'Support me on Patreon!',
      'Donate here',
      'TL note: this is a pun',
      'A/N: thanks for reading',
      '求月票！',
      '作者有话说',
      'ご支援よろしくお願いします',
      '翻译者：',
    ],
  },

  // Bylines.
  {
    id: 'byline_prefix',
    kind: 'byline',
    pattern: /^\s*(?:By|Written by)\s+[A-Z]|^\s*(?:作者|著者|撰文|文)\s*[:：]\s*\S/,
    maxUnits: 12,
    examples: ['By Aleks Phillips', 'Written by Jane Doe', '作者：某某', '著者：山田太郎'],
  },

  // Timestamps and dates.
  {
    id: 'timestamp_relative',
    kind: 'timestamp',
    pattern:
      /\b\d{1,3}\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b|\d+\s*(?:分钟|小时|天)前|\d+\s*(?:時間|日|分)前/i,
    maxUnits: 20,
    examples: ['19 hours ago', '3 days ago', '5 分钟前', '2 時間前'],
  },
  {
    id: 'timestamp_absolute',
    kind: 'timestamp',
    pattern: new RegExp(
      [
        /\b(?:updated|published|posted)\b[^.\n]{0,20}\b(?:19|20)\d{2}\b/.source,
        /\b\d{4}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/.source,
        `\\b(?:${MONTHS_EN}|${MONTHS_EN_SHORT})\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`,
        `\\b\\d{1,2}\\s+(?:${MONTHS_EN})\\s+\\d{4}\\b`,
        /\b\d{1,2}\s+de\s+[a-zà-ú]+\s+de\s+\d{4}\b/.source,
        `\\b\\d{1,2}\\s+(?:${MONTHS_IT})\\s+\\d{4}\\b`,
        `\\b\\d{1,2}\\.\\s+(?:${MONTHS_DE})\\s+\\d{4}\\b`,
        /\d{4}年\s*\d{1,2}月\s*\d{1,2}日/.source,
      ].join('|'),
      'i',
    ),
    maxUnits: 20,
    examples: [
      'Published Oct 11, 2026',
      'Updated: 2026-10-11',
      'Posted on 11 October 2026',
      'October 11, 2026',
      '11 de outubro de 2026',
      '11 ottobre 2026',
      '11. Oktober 2026',
      '2026年10月11日',
      '2026/10/11',
    ],
  },
  {
    id: 'timestamp_cjk_label',
    kind: 'timestamp',
    pattern: /投稿日|更新日|发布时间|发布于|更新于|掲載日|投稿時間/,
    maxUnits: 20,
    examples: ['投稿日：2026/10/11', '发布于 2026-10-11', '更新日：2026.10.11'],
  },
];

/** The first rule whose length cap and pattern both match the block, or null. */
export function matchRule(text: string, units: number): LexiconRule | null {
  for (const rule of LEXICON_RULES) {
    if (units < rule.maxUnits && rule.pattern.test(text)) return rule;
  }
  return null;
}
