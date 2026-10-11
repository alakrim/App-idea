import { defaultVoiceFor, voiceLanguage, voicesForLanguage } from './voices';

/** Voice lists from the live catalogue (ADR-0003 and the L1 brief). */
const MAI_MODEL = 'microsoft/mai-voice-2.1-flash';
const MAI_VOICES = [
  'en-US-Ethan:MAI-Voice-2.1-Flash',
  'it-IT-Grant:MAI-Voice-2.1-Flash',
  'pt-BR-Caio:MAI-Voice-2.1-Flash',
  'zh-CN-Bo:MAI-Voice-2.1-Flash',
  'de-DE-Klaus:MAI-Voice-2.1-Flash',
  'cs-CZ-Grant:MAI-Voice-2.1-Flash',
];

const VOXTRAL_MODEL = 'mistralai/voxtral-mini-tts';
const VOXTRAL_VOICES = ['en_paul_neutral', 'gb_jane_neutral', 'fr_marie_neutral'];

const KOKORO_MODEL = 'hexgrad/kokoro-82m';
const KOKORO_VOICES = [
  'af_heart',
  'af_alloy',
  'am_adam',
  'bf_emma',
  'if_sara',
  'pf_dora',
  'zf_xiaobei',
  'jf_alpha',
];

const GEMINI_MODEL = 'google/gemini-3.8-flash-lite-tts';
const GEMINI_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore'];

const ELEVEN_MODEL = 'elevenlabs/eleven-v3';
const ELEVEN_VOICES = ['george', 'sarah', 'adam', 'alice', 'bella', 'bill'];

describe('voiceLanguage', () => {
  it('reads the locale prefix of a Microsoft MAI voice', () => {
    expect(voiceLanguage(MAI_MODEL, 'it-IT-Grant:MAI-Voice-2.1-Flash')).toBe('it-IT');
    expect(voiceLanguage(MAI_MODEL, 'zh-CN-Bo:MAI-Voice-2.1-Flash')).toBe('zh-CN');
  });

  it('reads the language of a Mistral Voxtral voice, with gb as British English', () => {
    expect(voiceLanguage(VOXTRAL_MODEL, 'en_paul_neutral')).toBe('en');
    expect(voiceLanguage(VOXTRAL_MODEL, 'gb_jane_neutral')).toBe('en-GB');
    expect(voiceLanguage(VOXTRAL_MODEL, 'fr_marie_neutral')).toBe('fr');
  });

  it('reads the language of a Kokoro voice from its first letter', () => {
    const expected: Record<string, string> = {
      af_alloy: 'en',
      bf_emma: 'en',
      if_sara: 'it',
      pf_dora: 'pt-BR',
      zf_xiaobei: 'zh',
      jf_alpha: 'ja',
      ef_dora: 'es',
      ff_siwis: 'fr',
      hf_alpha: 'hi',
    };
    for (const [voice, lang] of Object.entries(expected)) {
      expect(voiceLanguage(KOKORO_MODEL, voice)).toBe(lang);
    }
  });

  it('marks Gemini, ElevenLabs and OpenAI voices as multilingual', () => {
    for (const voice of GEMINI_VOICES) expect(voiceLanguage(GEMINI_MODEL, voice)).toBe('multi');
    for (const voice of ELEVEN_VOICES) expect(voiceLanguage(ELEVEN_MODEL, voice)).toBe('multi');
    expect(voiceLanguage('openai/gpt-4o-mini-tts', 'alloy')).toBe('multi');
  });

  it('returns null for an unknown voice on an unknown model', () => {
    expect(voiceLanguage('acme/speech-1', 'nova')).toBeNull();
    expect(voiceLanguage('acme/speech-1', 'xx_unknown_voice')).toBeNull();
  });

  it('does not read a Voxtral-shaped id that names an unlisted locale', () => {
    expect(voiceLanguage(VOXTRAL_MODEL, 'de_klaus_neutral')).toBeNull();
  });
});

describe('voicesForLanguage', () => {
  it('returns only the MAI voices of the requested locale, with no ja-JP', () => {
    expect(voicesForLanguage(MAI_MODEL, MAI_VOICES, 'it')).toEqual([
      'it-IT-Grant:MAI-Voice-2.1-Flash',
    ]);
    expect(voicesForLanguage(MAI_MODEL, MAI_VOICES, 'pt-PT')).toEqual([
      'pt-BR-Caio:MAI-Voice-2.1-Flash',
    ]);
    expect(voicesForLanguage(MAI_MODEL, MAI_VOICES, 'ja')).toEqual([]);
  });

  it('matches British English voices to English', () => {
    expect(voicesForLanguage(VOXTRAL_MODEL, VOXTRAL_VOICES, 'en')).toEqual([
      'en_paul_neutral',
      'gb_jane_neutral',
    ]);
    expect(voicesForLanguage(VOXTRAL_MODEL, VOXTRAL_VOICES, 'de')).toEqual([]);
  });

  it('includes multilingual voices for every language', () => {
    expect(voicesForLanguage(GEMINI_MODEL, GEMINI_VOICES, 'ja')).toEqual(GEMINI_VOICES);
    expect(voicesForLanguage(ELEVEN_MODEL, ELEVEN_VOICES, 'it')).toEqual(ELEVEN_VOICES);
  });

  it('returns the Kokoro voices of the requested language', () => {
    expect(voicesForLanguage(KOKORO_MODEL, KOKORO_VOICES, 'it')).toEqual(['if_sara']);
    expect(voicesForLanguage(KOKORO_MODEL, KOKORO_VOICES, 'zh')).toEqual(['zf_xiaobei']);
    expect(voicesForLanguage(KOKORO_MODEL, KOKORO_VOICES, 'en')).toEqual([
      'af_heart',
      'af_alloy',
      'am_adam',
      'bf_emma',
    ]);
  });
});

describe('defaultVoiceFor', () => {
  it('prefers af_heart for English on Kokoro', () => {
    expect(defaultVoiceFor(KOKORO_MODEL, KOKORO_VOICES, 'en')).toBe('af_heart');
  });

  it('falls back to the first female Kokoro voice of the language', () => {
    expect(defaultVoiceFor(KOKORO_MODEL, KOKORO_VOICES, 'it')).toBe('if_sara');
    expect(defaultVoiceFor(KOKORO_MODEL, KOKORO_VOICES, 'ja')).toBe('jf_alpha');
    expect(defaultVoiceFor(KOKORO_MODEL, ['af_alloy', 'am_adam'], 'en')).toBe('af_alloy');
  });

  it('uses a male Kokoro voice only when the language has no female voice', () => {
    expect(defaultVoiceFor(KOKORO_MODEL, ['hm_omega'], 'hi')).toBe('hm_omega');
  });

  it('picks Kore for Gemini in any language', () => {
    expect(defaultVoiceFor(GEMINI_MODEL, GEMINI_VOICES, 'it')).toBe('Kore');
    expect(defaultVoiceFor(GEMINI_MODEL, ['Zephyr', 'Puck'], 'it')).toBe('Zephyr');
  });

  it('takes the first matching locale voice for other models', () => {
    expect(defaultVoiceFor(MAI_MODEL, MAI_VOICES, 'de')).toBe('de-DE-Klaus:MAI-Voice-2.1-Flash');
    expect(defaultVoiceFor(VOXTRAL_MODEL, VOXTRAL_VOICES, 'fr')).toBe('fr_marie_neutral');
    expect(defaultVoiceFor(ELEVEN_MODEL, ELEVEN_VOICES, 'it')).toBe('george');
  });

  it('returns null when no voice speaks the language', () => {
    expect(defaultVoiceFor(MAI_MODEL, MAI_VOICES, 'ja')).toBeNull();
    expect(defaultVoiceFor(VOXTRAL_MODEL, VOXTRAL_VOICES, 'ja')).toBeNull();
    expect(defaultVoiceFor(MAI_MODEL, [], 'it')).toBeNull();
  });
});
