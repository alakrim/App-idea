import {
  ambienceSummary,
  apiKeySummary,
  formatDb,
  MINUS_SIGN,
  narrationSummary,
  readingSummary,
  storageSummary,
  translationSummary,
} from './summaries';

describe('settings home summaries', () => {
  it('writes decibels with a true minus sign', () => {
    expect(formatDb(-22)).toBe(`${MINUS_SIGN}22 dB`);
    expect(formatDb(-21.6)).toBe(`${MINUS_SIGN}22 dB`);
  });

  it('shows ambience as On with its level, or Off', () => {
    expect(ambienceSummary({ enabled: true, levelDb: -22, duckingDb: 8 })).toBe(
      `On · ${MINUS_SIGN}22 dB`,
    );
    expect(ambienceSummary({ enabled: false, levelDb: -22, duckingDb: 8 })).toBe('Off');
  });

  it('shows the translation target, or Off', () => {
    expect(
      translationSummary({
        translationModel: 'anthropic/claude-haiku-5.5',
        defaultTargetLang: null,
      }),
    ).toBe('Claude Haiku 5.5 · Off');
    expect(
      translationSummary({
        translationModel: 'anthropic/claude-haiku-5.5',
        defaultTargetLang: 'it',
      }),
    ).toBe('Claude Haiku 5.5 · Italiano');
  });

  it('shows narration as model and voice, or the device voice', () => {
    const cloud = {
      provider: 'openrouter',
      model: 'google/gemini-3.8-flash-lite-tts',
      voice: 'Kore',
      style: null,
      speed: 1,
    } as const;
    expect(narrationSummary(cloud)).toBe('Gemini 3.8 Flash Lite TTS · Kore');
    expect(narrationSummary({ ...cloud, provider: 'device', voice: 'Samantha' })).toBe(
      'Device voice · Samantha',
    );
  });

  it('shows the key as connected with its tail, or not set', () => {
    expect(apiKeySummary('present', 'a1b2')).toBe('Connected · ending a1b2');
    expect(apiKeySummary('missing', null)).toBe('Not set');
  });

  it('formats reading size and storage', () => {
    expect(readingSummary({ fontScale: 1.2, showOriginal: false })).toBe('Text size 120%');
    expect(storageSummary(12.4 * 1024 * 1024, 3 * 1024 * 1024 * 1024)).toBe(
      '12 MB used · 3.0 GB free',
    );
  });
});
