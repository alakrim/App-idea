import {
  formatBytes,
  formatContext,
  formatHourlyCost,
  formatPerMillion,
  formatUsdPrecise,
  keyTail,
  modelLabel,
  providerLabel,
} from './format';

describe('model labels', () => {
  it('turns an OpenRouter id into a readable name without the vendor', () => {
    expect(modelLabel('anthropic/claude-haiku-5.5')).toBe('Claude Haiku 5.5');
    expect(modelLabel('google/gemini-3.8-flash-lite-tts')).toBe('Gemini 3.8 Flash Lite TTS');
    expect(modelLabel('openai/gpt-5-nano')).toBe('GPT 5 Nano');
  });

  it('drops variant suffixes such as :free', () => {
    expect(modelLabel('fish-audio/s2.1-pro-free:free')).toBe('S2.1 Pro Free');
  });

  it('names the provider, with a fallback for unknown vendors', () => {
    expect(providerLabel('x-ai/grok-4')).toBe('xAI');
    expect(providerLabel('someone/model')).toBe('Someone');
  });
});

describe('money and capacity', () => {
  it('shows a per-million price, and Free for zero', () => {
    expect(formatPerMillion(0.0000005)).toBe('$0.50');
    expect(formatPerMillion(0.000006)).toBe('$6.00');
    expect(formatPerMillion(0)).toBe('Free');
  });

  it('abbreviates context windows', () => {
    expect(formatContext(0)).toBe('—');
    expect(formatContext(128_000)).toBe('128K');
    expect(formatContext(1_000_000)).toBe('1M');
    expect(formatContext(1_500_000)).toBe('1.5M');
  });

  it('shows hourly cost, and a bound below one cent', () => {
    expect(formatHourlyCost(0.547)).toBe('≈ $0.547/h');
    expect(formatHourlyCost(0.0335)).toBe('≈ $0.0335/h');
    expect(formatHourlyCost(0.004)).toBe('under $0.01/h');
  });

  it('shows small previews with four decimals', () => {
    expect(formatUsdPrecise(0.0005)).toBe('$0.0005');
    expect(formatUsdPrecise(0)).toBe('$0');
  });
});

describe('storage and keys', () => {
  it('formats bytes in the largest sensible unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('exposes only the last four characters of a key', () => {
    expect(keyTail('sk-or-v1-abcdef1234')).toBe('1234');
    expect(keyTail('abc')).toBe('');
  });
});
