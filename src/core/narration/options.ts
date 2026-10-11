/*
 * The three narrators offered from the start (brief N1, ADR-0003 amendment). Each is one speech
 * model with the choices that make it work: its languages, its default voice, how much text one
 * request carries and the limits to tell the user about. Prices are not here: they come from the
 * live catalogue every time. Pure, so it runs in Node tests and on the device.
 */
import { defaultVoiceFor, KOKORO_LANGUAGES, primaryLanguage } from './voices';
import { DEFAULT_TTS_MAX_CHARS } from '../text/chunk';

import type { Lang } from '../domain';

export const NARRATOR_IDS = ['best', 'budget', 'free'] as const;
export type NarratorId = (typeof NARRATOR_IDS)[number];

export interface NarratorOption {
  readonly id: NarratorId;
  readonly modelId: string;
  readonly label: string;
  readonly tagline: string;
  /** Whether the model follows the `instructions` (style) field. */
  readonly supportsStyle: boolean;
  /** The languages the narrator speaks, or `multi` when it speaks all of them. */
  readonly languages: readonly Lang[] | 'multi';
  /** Longest text, in characters, sent in one speech request. Fewer requests mean fewer rate-limit hits. */
  readonly segmentMaxChars: number;
  /** A short, honest note about limits or trade-offs, shown on the card. */
  readonly notes: string;
  /**
   * The voice to select for `lang`. `voices` is the model's live voice list, which is empty while
   * the catalogue is unknown; the static fallback applies then. Null when the model takes no voice.
   */
  defaultVoice(lang: Lang, voices: readonly string[]): string | null;
}

export const KOKORO_MODEL_ID = 'hexgrad/kokoro-82m';
export const GEMINI_NARRATOR_MODEL_ID = 'google/gemini-3.8-flash-lite-tts';
export const FREE_NARRATOR_MODEL_ID = 'fish-audio/s2.1-pro-free:free';

/** Fish sends at most this much text per request. It is well under the 4,000-character guard. */
const FREE_SEGMENT_MAX_CHARS = 1_800;

const GEMINI_DEFAULT_VOICE = 'Kore';

/** Kokoro's voice for each language when the live list is not known yet. */
const KOKORO_FALLBACK_VOICES: Readonly<Record<string, string>> = {
  en: 'af_heart',
  es: 'ef_dora',
  fr: 'ff_siwis',
  hi: 'hf_alpha',
  it: 'if_sara',
  ja: 'jf_alpha',
  pt: 'pf_dora',
  zh: 'zf_xiaobei',
};

/** The message for a free narrator that has used up its daily allowance. */
export const FREE_NARRATOR_DAILY_LIMIT_MESSAGE =
  "The free narrator's daily limit is used up. Narration will continue tomorrow, or switch to the Budget narrator (about $0.03 per hour) in Settings.";

/** The first preferred voice that is listed, else the first listed voice, else the first preferred. */
function pickVoice(preferred: readonly string[], voices: readonly string[]): string | null {
  if (voices.length === 0) return preferred[0] ?? null;
  return preferred.find((voice) => voices.includes(voice)) ?? voices[0] ?? null;
}

export const NARRATOR_OPTIONS: readonly NarratorOption[] = [
  {
    id: 'best',
    modelId: GEMINI_NARRATOR_MODEL_ID,
    label: 'Best quality',
    tagline: 'Our default. Warm, steerable narration in every language.',
    supportsStyle: true,
    languages: 'multi',
    segmentMaxChars: DEFAULT_TTS_MAX_CHARS,
    notes: 'Follows your style notes, so you can steer how it reads.',
    defaultVoice: (_lang, voices) => pickVoice([GEMINI_DEFAULT_VOICE], voices),
  },
  {
    id: 'budget',
    modelId: KOKORO_MODEL_ID,
    label: 'Budget',
    tagline: 'Clear, natural voices at a fraction of the price.',
    supportsStyle: false,
    languages: KOKORO_LANGUAGES,
    segmentMaxChars: DEFAULT_TTS_MAX_CHARS,
    notes: 'Speaks only the languages listed. Choose it for those.',
    defaultVoice: (lang, voices) =>
      voices.length === 0
        ? (KOKORO_FALLBACK_VOICES[primaryLanguage(lang)] ?? null)
        : defaultVoiceFor(KOKORO_MODEL_ID, voices, lang),
  },
  {
    id: 'free',
    modelId: FREE_NARRATOR_MODEL_ID,
    label: 'Free',
    tagline: 'No cost. Multilingual narration with daily limits.',
    supportsStyle: false,
    languages: 'multi',
    segmentMaxChars: FREE_SEGMENT_MAX_CHARS,
    notes:
      'OpenRouter limits free models per minute and per day. When the day runs out, narration resumes after it resets, and finished audio is kept.',
    defaultVoice: (_lang, voices) => pickVoice([], voices),
  },
];

/** The narrator that uses `modelId`, or null for any other speech model. */
export function optionFor(modelId: string): NarratorOption | null {
  return NARRATOR_OPTIONS.find((option) => option.modelId === modelId) ?? null;
}

/** Whether the narrator speaks `lang`. The language family counts, so `pt` matches `pt-BR`. */
export function isLanguageSupported(option: NarratorOption, lang: Lang): boolean {
  if (option.languages === 'multi') return true;
  const family = primaryLanguage(lang);
  return option.languages.some((spoken) => primaryLanguage(spoken) === family);
}

/** The segment size for a speech model. Models outside the three narrators use the default. */
export function segmentMaxCharsFor(modelId: string): number {
  return optionFor(modelId)?.segmentMaxChars ?? DEFAULT_TTS_MAX_CHARS;
}
