import { SPEECH_AUDIO_TOKENS_PER_SECOND, TEXT_CHARS_PER_TOKEN } from '../llm/cost';
import { SPEECH_CHARS_PER_SECOND } from '../text/speech-rate';
import { CATALOG, MODELS } from './__fixtures__/fake-ports';
import { estimateChapterCost, translationExpansion } from './estimate';

const catalog = { find: async (id: string) => CATALOG[id] ?? null };

const BASE = {
  size: { unit: 'words', count: 5000 } as const,
  sourceLang: 'zh-Hans',
  targetLang: 'it',
  models: MODELS,
  catalog,
};

describe('estimateChapterCost', () => {
  it('prices a 5,000-word zh to it chapter with the default models and fixture pricing', async () => {
    // 5,000 CJK words are 7,500 characters, which is 7,500 tokens at one token per character.
    const estimate = await estimateChapterCost(BASE);

    expect(estimate.perStage.map((s) => s.stage)).toEqual([
      'cleanup',
      'analysis',
      'translation',
      'narration',
    ]);
    const usd = Object.fromEntries(estimate.perStage.map((s) => [s.stage, s.usd]));
    // Cleanup: 4,800 input tokens (60% of the text plus instructions), 200 output tokens.
    expect(usd.cleanup).toBeCloseTo(4_800 * 0.00000005 + 200 * 0.0000004, 12);
<<<<<<< HEAD
    // Analysis: one chunk, 10,540 input tokens (text, prompt and priors), 900 output tokens.
    // The prompt is analysis-v3 (ADR-0005 amendment), 67 tokens longer than v2's 10,473.
    expect(usd.analysis).toBeCloseTo(0.01504, 12);
=======
    // Analysis: one chunk, 12,047 input tokens (text, prompt and priors), 900 output tokens. The prompt is
    // analysis-v3 (A4): it lists each category's era and mustNotContain list and states the era rules,
    // which adds 1,574 input tokens to every analysis call. Was 10,473 tokens and 0.014973 before v3.
    expect(usd.analysis).toBeCloseTo(0.016547, 12);
>>>>>>> 54b3d2e
    // Translation: 14,615 input tokens over five chunks, and 12,000 output tokens (1.6 times the source).
    expect(usd.translation).toBeCloseTo(0.074615, 12);
    // Narration: 12,000 Italian tokens at four characters each, billed per character.
    expect(usd.narration).toBeCloseTo(48_000 * 0.00001, 12);

<<<<<<< HEAD
    expect(estimate.totalUsd).toBeCloseTo(0.569975, 9);
    expect(estimate.low).toBeLessThan(estimate.totalUsd);
    expect(estimate.high).toBeGreaterThan(estimate.totalUsd);
    // Analysis spread is 30 %: 0.01504 x 0.7 and x 1.3 move the bounds by the same amounts.
    expect(estimate.low).toBeCloseTo(0.4949185, 6);
    expect(estimate.high).toBeCloseTo(0.6450315, 6);
=======
    expect(estimate.totalUsd).toBeCloseTo(0.571482, 9);
    expect(estimate.low).toBeLessThan(estimate.totalUsd);
    expect(estimate.high).toBeGreaterThan(estimate.totalUsd);
    expect(estimate.low).toBeCloseTo(0.4959734, 6);
    expect(estimate.high).toBeCloseTo(0.6469906, 6);
>>>>>>> 54b3d2e
  });

  it('skips translation and bills narration on the source text when there is no target language', async () => {
    const estimate = await estimateChapterCost({ ...BASE, targetLang: null, sourceLang: 'en' });
    const translation = estimate.perStage.find((s) => s.stage === 'translation');
    expect(translation).toEqual({
      stage: 'translation',
      usd: 0,
      basis: 'no translation for this chapter',
    });
    // 5,000 English words at six characters each, billed as narration.
    const narration = estimate.perStage.find((s) => s.stage === 'narration');
    expect(narration?.usd).toBeCloseTo(30_000 * 0.00001, 12);
  });

  it('treats a target equal to the source as no translation', async () => {
    const estimate = await estimateChapterCost({ ...BASE, targetLang: 'zh-hans' });
    expect(estimate.perStage.find((s) => s.stage === 'translation')?.usd).toBe(0);
  });

  it('counts characters directly when the size is given in characters', async () => {
    const estimate = await estimateChapterCost({
      ...BASE,
      size: { unit: 'chars', count: 54_000 },
      targetLang: null,
      sourceLang: 'en',
    });
    expect(estimate.perStage.find((s) => s.stage === 'narration')?.usd).toBeCloseTo(0.54, 12);
  });

  it('shows zero and says why when a model is missing from the catalog', async () => {
    const estimate = await estimateChapterCost({
      ...BASE,
      models: { ...MODELS, analysis: 'vendor/removed' },
    });
    expect(estimate.perStage.find((s) => s.stage === 'analysis')).toEqual({
      stage: 'analysis',
      usd: 0,
      basis: 'pricing unavailable for vendor/removed',
    });
  });
});

describe('translationExpansion', () => {
  it('uses the documented language-pair factors', () => {
    expect(translationExpansion('zh', 'it')).toBe(1.6);
    expect(translationExpansion('en', 'it')).toBe(1.2);
    expect(translationExpansion('en', 'ja')).toBe(0.8);
    expect(translationExpansion('ja', 'zh')).toBe(1);
  });
});

describe('narration cost by script on a token-priced model', () => {
  // Audio is billed per second, so the same character count costs more when it is slower to speak.
  const tokenPricedNarration = {
    id: MODELS.narration,
    pricing: { prompt: 0.0000005, completion: 0.000006 },
    supportsStyle: true,
  };
  const pricedCatalog = {
    find: async (id: string) =>
      id === MODELS.narration ? tokenPricedNarration : (CATALOG[id] ?? null),
  };

  async function narrationUsd(sourceLang: string, chars: number): Promise<number> {
    const estimate = await estimateChapterCost({
      size: { unit: 'chars', count: chars },
      sourceLang,
      targetLang: null,
      models: MODELS,
      catalog: pricedCatalog,
    });
    return estimate.perStage.find((s) => s.stage === 'narration')?.usd ?? Number.NaN;
  }

  it('prices a zh chapter three to four times a same-length en chapter', async () => {
    const zh = await narrationUsd('zh', 10_000);
    const en = await narrationUsd('en', 10_000);
    expect(zh / en).toBeGreaterThan(3);
    expect(zh / en).toBeLessThan(4);
  });

  it('bills 10,000 zh characters at the Han rate in audio tokens, plus the text tokens', async () => {
    // Audio seconds at the Han rate x 25 tokens a second x $6/M, plus the text tokens at $0.50/M.
    const audioSeconds = 10_000 / SPEECH_CHARS_PER_SECOND.han;
    const textTokens = 10_000 / TEXT_CHARS_PER_TOKEN;
    const expected =
      audioSeconds * SPEECH_AUDIO_TOKENS_PER_SECOND * 0.000006 + textTokens * 0.0000005;
    expect(await narrationUsd('zh', 10_000)).toBeCloseTo(expected, 10);
  });

  it('bills the spoken language of a translated chapter, not the source language', async () => {
    // zh to it: the narration is Italian, so the Latin rate applies.
    const estimate = await estimateChapterCost({
      size: { unit: 'chars', count: 10_000 },
      sourceLang: 'zh',
      targetLang: 'it',
      models: MODELS,
      catalog: pricedCatalog,
    });
    const narration = estimate.perStage.find((s) => s.stage === 'narration')?.usd ?? 0;
    expect(narration).toBeGreaterThan(0);
    expect(estimate.perStage.find((s) => s.stage === 'narration')?.basis).toContain(
      'it speech rate',
    );
  });
});
