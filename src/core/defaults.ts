import type { Settings } from './settings';

/**
 * Model ids used until the user picks others. Taken from R1's recommendations
 * (docs/research/R1-openrouter.md, sections 1g and 7). Change them here, nowhere else.
 */
export const DEFAULT_MODELS = {
  /** Literary translation: top of the cheap tier by AA index. */
  translation: 'anthropic/claude-haiku-5.5',
  /** Chapter memory and ambience cues: structured JSON output. */
  analysis: 'anthropic/claude-haiku-5.5',
  /** Content cleanup: low cost, large context, structured output. */
  cleanup: 'openai/gpt-5-nano',
} as const;

/** Narration default: the recommended tier in ADR-0003, with audiobook steering. */
export const DEFAULT_NARRATION = {
  provider: 'openrouter',
  model: 'google/gemini-3.8-flash-lite-tts',
  voice: 'Kore',
  style: 'Warm audiobook narrator with a measured pace.',
  speed: 1,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  uiLanguage: 'en',
  defaultTargetLang: null,
  translationModel: DEFAULT_MODELS.translation,
  analysisModel: DEFAULT_MODELS.analysis,
  cleanupModel: DEFAULT_MODELS.cleanup,
  narration: { ...DEFAULT_NARRATION },
  ambience: { enabled: true, levelDb: -22, duckingDb: 8 },
  reading: { fontScale: 1, showOriginal: false },
  onboardingDone: false,
  contentNoticeAccepted: false,
};
