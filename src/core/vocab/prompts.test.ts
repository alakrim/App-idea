import {
  buildVocabPrompt,
  VOCAB_EXPLANATION_MAX_WORDS,
  VOCAB_SYSTEM_PROMPT,
  VocabExplanationSchema,
} from './prompts';

const valid = {
  term: 'Bellissimo',
  lemma: 'bellissimo',
  partOfSpeech: 'adjective',
  translation: 'beautiful',
  explanation: 'Very beautiful. Used for things that look wonderful.',
  example: null,
};

describe('VocabExplanationSchema', () => {
  it('accepts a complete reply with nullable fields set to null', () => {
    expect(VocabExplanationSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a missing key, because absent values must be null', () => {
    const { example: _example, ...withoutExample } = valid;

    expect(VocabExplanationSchema.safeParse(withoutExample).success).toBe(false);
  });

  it('rejects an explanation longer than the word cap', () => {
    const tooLong = Array.from({ length: VOCAB_EXPLANATION_MAX_WORDS + 1 }, () => 'word').join(' ');

    expect(VocabExplanationSchema.safeParse({ ...valid, explanation: tooLong }).success).toBe(
      false,
    );
  });

  it('accepts an explanation at exactly the word cap', () => {
    const atCap = Array.from({ length: VOCAB_EXPLANATION_MAX_WORDS }, () => 'word').join(' ');

    expect(VocabExplanationSchema.safeParse({ ...valid, explanation: atCap }).success).toBe(true);
  });

  it('rejects an empty translation', () => {
    expect(VocabExplanationSchema.safeParse({ ...valid, translation: '' }).success).toBe(false);
  });
});

describe('buildVocabPrompt', () => {
  it('puts the studied language, explanation language, term and sentence in the user message', () => {
    const prompt = buildVocabPrompt({
      term: 'Bellissimo',
      sentence: 'Il tramonto era bellissimo.',
      studiedLang: 'it',
      explainLang: 'en',
    });

    expect(prompt.system).toBe(VOCAB_SYSTEM_PROMPT);
    expect(prompt.user).toBe(
      'Studied language: it\nExplanation language: en\nTerm: Bellissimo\nSentence: Il tramonto era bellissimo.',
    );
  });
});
