/*
 * Voice language metadata. Some speech providers sell voices for one locale only: a Microsoft MAI
 * voice speaks its own locale, a Mistral Voxtral voice speaks English, British English or French, and a
 * Kokoro voice speaks the language its first letter names. The voice picker must show only the voices
 * that can speak the target language. Gemini, ElevenLabs and OpenAI voices are multilingual.
 * Voice-id conventions are taken from the live catalogue (ADR-0003).
 */
import type { Lang } from '../domain';

/** The language a voice speaks, `multi` for a multilingual voice, or null when it is unknown. */
export type VoiceLanguage = Lang | 'multi';

/** Microsoft MAI ids carry their locale: `it-IT-Grant:MAI-Voice-2.1-Flash`. */
const MAI_VOICE = /^([a-z]{2}-[A-Z]{2})-[^:]+:MAI-/;
/** Mistral Voxtral ids name their locale: `en_paul_neutral`. Only en, gb and fr exist. */
const VOXTRAL_VOICE = /^(en|gb|fr)_[a-z]+_[a-z]+$/;
const VOXTRAL_LANGUAGE: Readonly<Record<string, Lang>> = { en: 'en', gb: 'en-GB', fr: 'fr' };
/** Kokoro ids: a language letter, a gender letter, then the name: `af_heart`, `if_sara`. */
const KOKORO_VOICE = /^([abefhijpz])([fm])_[a-z]+$/;
const KOKORO_LANGUAGE: Readonly<Record<string, Lang>> = {
  a: 'en',
  b: 'en',
  e: 'es',
  f: 'fr',
  h: 'hi',
  i: 'it',
  j: 'ja',
  p: 'pt-BR',
  z: 'zh',
};
const MULTILINGUAL_MODEL = /gemini|elevenlabs|openai|gpt-/i;

/** The default voice for a Gemini model, when it is among the voices. */
const GEMINI_DEFAULT_VOICE = 'Kore';
const KOKORO_DEFAULT_VOICE = 'af_heart';

function primaryLanguage(lang: string): string {
  return (lang.split('-')[0] ?? lang).toLowerCase();
}

/** The language of one voice of one model, or null when the id does not show it. */
export function voiceLanguage(modelId: string, voiceId: string): VoiceLanguage | null {
  const mai = MAI_VOICE.exec(voiceId);
  if (mai?.[1]) return mai[1];

  const voxtral = VOXTRAL_VOICE.exec(voiceId);
  if (voxtral?.[1]) return VOXTRAL_LANGUAGE[voxtral[1]] ?? null;

  const kokoro = KOKORO_VOICE.exec(voiceId);
  if (kokoro?.[1]) return KOKORO_LANGUAGE[kokoro[1]] ?? null;

  return MULTILINGUAL_MODEL.test(modelId) ? 'multi' : null;
}

/** The voices that can speak `lang`. Multilingual voices are always included. */
export function voicesForLanguage(
  modelId: string,
  voices: readonly string[],
  lang: Lang,
): string[] {
  const wanted = primaryLanguage(lang);
  return voices.filter((voice) => {
    const spoken = voiceLanguage(modelId, voice);
    if (spoken === null) return false;
    return spoken === 'multi' || primaryLanguage(spoken) === wanted;
  });
}

/**
 * The voice to pre-select for `lang`. Kokoro prefers the female voice of the language (`af_heart`
 * for English, otherwise the first female voice of that language). Gemini prefers `Kore`. Every
 * other model takes its first voice for the language. Null when no voice speaks the language.
 */
export function defaultVoiceFor(
  modelId: string,
  voices: readonly string[],
  lang: Lang,
): string | null {
  const matching = voicesForLanguage(modelId, voices, lang);
  if (matching.length === 0) return null;

  const femaleKokoro = matching.filter((voice) => KOKORO_VOICE.exec(voice)?.[2] === 'f');
  if (femaleKokoro.length > 0) {
    return femaleKokoro.includes(KOKORO_DEFAULT_VOICE)
      ? KOKORO_DEFAULT_VOICE
      : (femaleKokoro[0] ?? null);
  }
  if (/gemini/i.test(modelId) && matching.includes(GEMINI_DEFAULT_VOICE)) {
    return GEMINI_DEFAULT_VOICE;
  }
  return matching[0] ?? null;
}
