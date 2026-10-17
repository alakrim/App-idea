/*
 * The three narrators offered from the start (brief N1, ADR-0003 amendment). Each is one speech
 * model with the choices that make it work: its languages, its default voice, how much text one
 * request carries and the limits to tell the user about. Prices are not here: they come from the
 * live catalogue every time. Pure, so it runs in Node tests and on the device.
 */
import { isFishModel } from './capabilities';
import { defaultVoiceFor, KOKORO_LANGUAGES, primaryLanguage } from './voices';
import {
  DEFAULT_TTS_FIRST_MAX_SECONDS,
  DEFAULT_TTS_MAX_CHARS,
  DEFAULT_TTS_MAX_SECONDS,
} from '../text/chunk';

import type { Lang } from '../domain';

export type NarratorId = 'best' | 'budget' | 'free';

export interface NarratorOption {
  readonly id: NarratorId;
  readonly modelId: string;
  readonly label: string;
  readonly tagline: string;
  /** Whether the model follows the `instructions` (style) field. */
  readonly supportsStyle: boolean;
  /** The languages the narrator speaks, or `multi` when it speaks all of them. */
  readonly languages: readonly Lang[] | 'multi';
<<<<<<< HEAD
=======
  /** Longest text, in characters, sent in one speech request. Fewer requests mean fewer rate-limit hits. */
  readonly segmentMaxChars: number;
  /**
   * Longest text, in estimated speech seconds, sent in one request. Speech density differs by script,
   * so a size in characters alone makes very uneven requests. Long requests also hit gateway timeouts.
   */
  readonly segmentMaxSeconds: number;
  /** Longest first text segment, in estimated speech seconds, so the first audio starts quickly. */
  readonly firstMaxSeconds: number;
  /** Speech requests in flight at once. The free models are rate-limited per minute, so they run one at a time. */
  readonly narrateConcurrency: number;
>>>>>>> 54b3d2e
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

<<<<<<< HEAD
/** Fish models take longer passages per request: 1,800 characters, well under the 4,000-character guard. */
const FISH_SEGMENT_MAX_CHARS = 1_800;
=======
/** Fish sends at most this much text per request. It is well under the 4,000-character guard. */
const FREE_SEGMENT_MAX_CHARS = 1_800;
/** Fish takes longer passages, so fewer requests hit its per-minute limit. */
const FREE_SEGMENT_MAX_SECONDS = 120;

/** Speech requests in flight for a narrator that is not rate-limited per minute. */
const PAID_NARRATE_CONCURRENCY = 3;
/** Speech requests in flight when the model is not one of the three narrators. */
export const DEFAULT_NARRATE_CONCURRENCY = 2;
>>>>>>> 54b3d2e

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
<<<<<<< HEAD
=======
    segmentMaxChars: DEFAULT_TTS_MAX_CHARS,
    segmentMaxSeconds: DEFAULT_TTS_MAX_SECONDS,
    firstMaxSeconds: DEFAULT_TTS_FIRST_MAX_SECONDS,
    narrateConcurrency: PAID_NARRATE_CONCURRENCY,
>>>>>>> 54b3d2e
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
<<<<<<< HEAD
=======
    segmentMaxChars: DEFAULT_TTS_MAX_CHARS,
    segmentMaxSeconds: DEFAULT_TTS_MAX_SECONDS,
    firstMaxSeconds: DEFAULT_TTS_FIRST_MAX_SECONDS,
    narrateConcurrency: PAID_NARRATE_CONCURRENCY,
>>>>>>> 54b3d2e
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
<<<<<<< HEAD
=======
    segmentMaxChars: FREE_SEGMENT_MAX_CHARS,
    segmentMaxSeconds: FREE_SEGMENT_MAX_SECONDS,
    firstMaxSeconds: DEFAULT_TTS_FIRST_MAX_SECONDS,
    narrateConcurrency: 1,
>>>>>>> 54b3d2e
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

<<<<<<< HEAD
/**
 * The longest text, in characters, sent in one speech request. Fish models take more per request,
 * and fewer requests mean fewer rate-limit hits. Every other speech model uses the default.
 */
export function segmentMaxCharsFor(modelId: string): number {
  return isFishModel(modelId) ? FISH_SEGMENT_MAX_CHARS : DEFAULT_TTS_MAX_CHARS;
=======
/** How a speech model's text is split into requests. */
export interface SegmentLimits {
  readonly maxChars: number;
  readonly maxSeconds: number;
  readonly firstMaxSeconds: number;
}

/** The segment limits for a speech model. Models outside the three narrators use the defaults. */
export function segmentLimitsFor(modelId: string): SegmentLimits {
  const option = optionFor(modelId);
  return {
    maxChars: option?.segmentMaxChars ?? DEFAULT_TTS_MAX_CHARS,
    maxSeconds: option?.segmentMaxSeconds ?? DEFAULT_TTS_MAX_SECONDS,
    firstMaxSeconds: option?.firstMaxSeconds ?? DEFAULT_TTS_FIRST_MAX_SECONDS,
  };
}

/** Speech requests in flight for a speech model. Models outside the three narrators use the default. */
export function narrateConcurrencyFor(modelId: string): number {
  return optionFor(modelId)?.narrateConcurrency ?? DEFAULT_NARRATE_CONCURRENCY;
>>>>>>> 54b3d2e
}
