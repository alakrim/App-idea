import { QA_SYSTEM_PROMPT, buildQaPrompt } from './qa';
import { emptyMemory, fakeId } from '../analysis/__fixtures__/builders';

import type { QaFtsHit, QaPromptInput } from './qa';
import type { ChapterMemoryRecord } from '../analysis/types';

const CUTOFF = { chapterOrder: 3, sentenceIdx: 12 };

function record(chapterOrder: number, summary: string): ChapterMemoryRecord {
  return {
    chapterOrder,
    chapterNumber: chapterOrder,
    memory: emptyMemory({
      chapterId: fakeId(chapterOrder),
      summary,
      keyEvents: [`${summary} event`],
      characters: [{ name: `Hero${chapterOrder}`, aliases: [], facts: [`${summary} fact`] }],
    }),
  };
}

const MEMORIES: ChapterMemoryRecord[] = [
  record(1, 'EARLY_CH1'),
  record(2, 'EARLY_CH2'),
  record(3, 'CURRENT_CH3_CARD_SECRET'), // the cutoff chapter's own card: must never appear
  record(4, 'FUTURE_CH4_SECRET'),
];

const HITS: QaFtsHit[] = [
  {
    chapterOrder: 3,
    chapterNumber: 3,
    sentenceIdx: 5,
    text: 'Early passage in the cutoff chapter.',
  },
  { chapterOrder: 3, chapterNumber: 3, sentenceIdx: 12, text: 'Exact cutoff sentence.' },
  {
    chapterOrder: 3,
    chapterNumber: 3,
    sentenceIdx: 13,
    text: 'FUTURE_SENTENCE_SECRET after the cutoff.',
  },
  {
    chapterOrder: 2,
    chapterNumber: 2,
    sentenceIdx: 99,
    text: 'EARLIER_CHAPTER_HIT_TEXT is answerable.',
  },
  { chapterOrder: 4, chapterNumber: 4, sentenceIdx: 0, text: 'FUTURE_CHAPTER_RAW_TEXT' },
];

function input(overrides: Partial<QaPromptInput> = {}): QaPromptInput {
  return {
    question: 'Who is the hero?',
    cutoff: CUTOFF,
    codex: '## Characters\n- Hero1: EARLY_CH1 fact (Ch. 1)',
    memories: MEMORIES,
    ftsHits: HITS,
    lang: 'fr',
    ...overrides,
  };
}

describe('buildQaPrompt spoiler safety', () => {
  it('never includes the current chapter memory card or anything from later chapters', () => {
    const { system, user } = buildQaPrompt(input());
    const all = system + user;
    expect(all).not.toContain('CURRENT_CH3_CARD_SECRET');
    expect(all).not.toContain('FUTURE_CH4_SECRET');
    expect(all).not.toContain('FUTURE_CHAPTER_RAW_TEXT');
    expect(all).not.toContain('FUTURE_SENTENCE_SECRET');
  });

  it('includes memory cards only from chapters strictly before the cutoff', () => {
    const { user } = buildQaPrompt(input());
    expect(user).toContain('### Ch. 1');
    expect(user).toContain('EARLY_CH1');
    expect(user).toContain('### Ch. 2');
    expect(user).not.toContain('### Ch. 3');
  });

  it('sends passage hits up to and including the cutoff sentence, cited as (Ch. N)', () => {
    const { user } = buildQaPrompt(input());
    expect(user).toContain('(Ch. 3) Early passage in the cutoff chapter.');
    expect(user).toContain('(Ch. 3) Exact cutoff sentence.');
    expect(user).not.toContain('FUTURE_SENTENCE_SECRET');
  });

  it('keeps passage hits from earlier chapters at any sentence, cited by their own chapter', () => {
    const { user } = buildQaPrompt(input());
    expect(user).toContain('(Ch. 2) EARLIER_CHAPTER_HIT_TEXT is answerable.');
    expect(user.indexOf('(Ch. 2)')).toBeLessThan(user.indexOf('(Ch. 3) Early passage'));
  });

  it('applies the cutoff sentence rule to the cutoff chapter only, not to earlier chapters', () => {
    const { user } = buildQaPrompt(
      input({
        ftsHits: [
          { chapterOrder: 2, chapterNumber: 2, sentenceIdx: 0, text: 'EARLY_HIT_IDX0' },
          { chapterOrder: 3, chapterNumber: 3, sentenceIdx: 12, text: 'CUTOFF_HIT_IDX12' },
          { chapterOrder: 3, chapterNumber: 3, sentenceIdx: 13, text: 'CUTOFF_HIT_IDX13' },
        ],
      }),
    );
    expect(user).toContain('EARLY_HIT_IDX0');
    expect(user).toContain('CUTOFF_HIT_IDX12');
    expect(user).not.toContain('CUTOFF_HIT_IDX13');
  });

  it('re-filters memories by order even when the caller passes them in unfiltered', () => {
    const { user } = buildQaPrompt(input({ memories: [...MEMORIES].reverse() }));
    expect(user).not.toContain('CURRENT_CH3_CARD_SECRET');
    expect(user).not.toContain('FUTURE_CH4_SECRET');
  });

  it('places chapter memory cards in chapter order regardless of input order', () => {
    const { user } = buildQaPrompt(input({ memories: [MEMORIES[1]!, MEMORIES[0]!] }));
    expect(user.indexOf('### Ch. 1')).toBeLessThan(user.indexOf('### Ch. 2'));
  });

  it('keeps the codex as given, since it is built at the same cutoff', () => {
    const { user } = buildQaPrompt(input());
    expect(user).toContain('- Hero1: EARLY_CH1 fact (Ch. 1)');
  });
});

describe('buildQaPrompt content', () => {
  it('tells the model to answer only from the notes, cite chapters and admit what is not revealed', () => {
    expect(QA_SYSTEM_PROMPT).toContain('Use only the NOTES');
    expect(QA_SYSTEM_PROMPT).toContain('"(Ch. N)"');
    expect(QA_SYSTEM_PROMPT).toContain('has not been revealed yet');
    expect(QA_SYSTEM_PROMPT).toContain('Never use outside knowledge');
  });

  it('asks for the answer in the requested language and carries the question', () => {
    const { user } = buildQaPrompt(input());
    expect(user).toContain('Answer language: fr');
    expect(user).toContain('QUESTION: Who is the hero?');
  });

  it('shows (none) for empty sections', () => {
    const { user } = buildQaPrompt(input({ codex: '', memories: [], ftsHits: [] }));
    expect(user.match(/\(none\)/g)).toHaveLength(3);
  });

  it('uses the same static system prompt for every question', () => {
    expect(buildQaPrompt(input()).system).toBe(buildQaPrompt(input({ question: 'Other?' })).system);
  });
});
