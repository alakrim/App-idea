import { estimateChatCost, estimateSpeechCost, formatUsd } from './cost';

const tokenPriced = { pricing: { prompt: 0.0000005, completion: 0.000006 } };
const characterPriced = { pricing: { prompt: 0.00004, completion: 0 } };

describe('estimateChatCost', () => {
  it('multiplies prompt and completion tokens by their per-token prices', () => {
    const model = { pricing: { prompt: 0.1 / 1_000_000, completion: 0.5 / 1_000_000 } };
    expect(estimateChatCost(model, 2_000, 1_000)).toBeCloseTo(0.0002 + 0.0005, 12);
  });

  it('returns zero for free models', () => {
    expect(estimateChatCost({ pricing: { prompt: 0, completion: 0 } }, 5_000, 5_000)).toBe(0);
  });
});

describe('estimateSpeechCost', () => {
  it('bills per character when the model has no completion price', () => {
    // An hour of narration (54,000 characters) on ElevenLabs v4 via OpenRouter: about $2.16 (R1, 1f).
    expect(estimateSpeechCost(characterPriced, 54_000)).toBeCloseTo(2.16, 10);
  });

  it('bills audio tokens plus text input when the model is priced per token', () => {
    // 54,000 characters = 3,600 s of audio = 90,000 audio tokens at $6/M, plus 13,500 text tokens
    // at $0.50/M. This matches the R1 figure of about $0.55 per hour.
    const expected = 90_000 * 0.000006 + 13_500 * 0.0000005;
    expect(estimateSpeechCost(tokenPriced, 54_000, 3_600)).toBeCloseTo(expected, 10);
    expect(estimateSpeechCost(tokenPriced, 54_000, 3_600)).toBeCloseTo(0.54675, 5);
  });

  it('bills an hour of characters as 3,600 s when no seconds are given (ADR-0003)', () => {
    // 54,000 characters = 3,600 s, the same hour the settings voice tiers are priced on.
    const expected = 90_000 * 0.000006 + 13_500 * 0.0000005;
    expect(estimateSpeechCost(tokenPriced, 54_000)).toBeCloseTo(expected, 10);
  });

  it('prices the seconds it is given, so a slow script costs more per character', () => {
    // The seconds are passed in, so no rate applies. 1,000 s of audio is 25,000 tokens at $6/M, plus
    // 1,125 text tokens (4,500 characters) at $0.50/M. The audio part is the same for the same seconds.
    const expected = 25_000 * 0.000006 + 1_125 * 0.0000005;
    expect(estimateSpeechCost(tokenPriced, 4_500, 1_000)).toBeCloseTo(expected, 10);
  });

  it('returns zero for empty input', () => {
    expect(estimateSpeechCost(characterPriced, 0)).toBe(0);
    expect(estimateSpeechCost(tokenPriced, 0)).toBe(0);
  });
});

describe('formatUsd', () => {
  it.each([
    [0, '$0.00'],
    [0.004, '< $0.01'],
    [0.0186, '$0.019'],
    [0.5467, '$0.55'],
    [0.5, '$0.50'],
    [2.16, '$2.16'],
    [12.345, '$12.3'],
    [123.4, '$123'],
    [1234.5, '$1235'],
  ])('formats %p as %p', (amount, expected) => {
    expect(formatUsd(amount)).toBe(expected);
  });

  it('rejects non-finite amounts', () => {
    expect(() => formatUsd(Number.NaN)).toThrow(RangeError);
  });
});
