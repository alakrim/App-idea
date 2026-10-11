import {
  buildTranslatePrompt,
  TRANSLATE_PROMPT_VERSION,
  TRANSLATE_SYSTEM_PROMPT,
  withRepairNote,
} from './prompts';

import type { TranslatePromptInput } from './prompts';

const BASE: TranslatePromptInput = {
  sentences: [
    { idx: 4, text: 'Il  vento\nsoffiava.' },
    { idx: 5, text: '— Vieni?' },
  ],
  sourceLang: 'it',
  targetLang: 'en',
  glossary: [
    { term: 'Ada Vellani', translation: null, note: null },
    { term: 'la Torre', translation: 'the Tower', note: 'capitalised as a place' },
  ],
  styleNotes: '  plain,   warm  ',
  previousContext: [{ idx: 3, source: 'Partì all alba.', translation: 'She left at dawn.' }],
};

describe('buildTranslatePrompt', () => {
  it('keeps the system prompt identical for every input, so it is a cacheable prefix', () => {
    const other = buildTranslatePrompt({
      ...BASE,
      sourceLang: 'pt',
      targetLang: 'de',
      glossary: [],
      styleNotes: null,
      previousContext: [],
    });
    expect(other.system).toBe(TRANSLATE_SYSTEM_PROMPT);
    expect(buildTranslatePrompt(BASE).system).toBe(TRANSLATE_SYSTEM_PROMPT);
  });

  it('states the listening, alignment and punctuation rules in the system prompt', () => {
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('Translate for listening');
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('Never merge or split sentences');
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('«»');
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('{"items": [{"idx": integer, "text": string}]}');
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('return it unchanged');
  });

  it('puts languages, normalised style notes, glossary and context in the user message', () => {
    const { user } = buildTranslatePrompt(BASE);
    expect(user).toContain('Source language: it\nTarget language: en\nStyle notes: plain, warm');
    expect(user).toContain('- Ada Vellani (keep as written)');
    expect(user).toContain('- la Torre => the Tower (capitalised as a place)');
    expect(user).toContain('[3] Partì all alba.\n  => She left at dawn.');
  });

  it('writes each passage line as [idx] text with whitespace collapsed', () => {
    const { user } = buildTranslatePrompt(BASE);
    expect(user.endsWith('[4] Il vento soffiava.\n[5] — Vieni?')).toBe(true);
  });

  it('marks missing translations and empty optional sections explicitly', () => {
    const { user } = buildTranslatePrompt({
      ...BASE,
      styleNotes: null,
      glossary: [],
      previousContext: [{ idx: 3, source: 'Partì.', translation: null }],
    });
    expect(user).toContain('Style notes: (none)');
    expect(user).toContain('Glossary (keep these names and terms consistent):\n(none)');
    expect(user).toContain('  => (translation pending)');
  });

  it('shows "(none)" for an empty context', () => {
    const { user } = buildTranslatePrompt({ ...BASE, previousContext: [] });
    expect(user).toContain('do not return them):\n(none)');
  });

  it('appends a repair note without changing the system prompt', () => {
    const prompt = buildTranslatePrompt(BASE);
    const repaired = withRepairNote(prompt, 'Reply again.');
    expect(repaired.system).toBe(prompt.system);
    expect(repaired.user).toBe(`${prompt.user}\n\nReply again.`);
  });

  it('matches the snapshot for the current prompt version', () => {
    expect(TRANSLATE_PROMPT_VERSION).toBe('translate-v1');
    expect(buildTranslatePrompt(BASE)).toMatchSnapshot();
  });
});

describe('TRANSLATE_SYSTEM_PROMPT', () => {
  it('is a static string with no interpolated values left in it', () => {
    expect(TRANSLATE_SYSTEM_PROMPT).not.toMatch(/\$\{/u);
  });
});
