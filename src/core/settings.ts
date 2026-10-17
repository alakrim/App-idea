import { z } from 'zod';

import { LangSchema, NarrationProfileSchema } from './domain';
import { BED_LEVEL_RANGE_DB, DUCKING_RANGE_DB, PLAYBACK_RATE_RANGE } from './playback/ranges';

/** OpenRouter model ids look like `vendor/model`, optionally with a `:variant` suffix. */
export const ModelIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    'Expected an OpenRouter model id, such as vendor/model',
  );

export const ThemeModeSchema = z.enum(['system', 'dark', 'light']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

/** Narration settings are a narration profile without its identity. */
export const NarrationSettingsSchema = NarrationProfileSchema.omit({ id: true, name: true });
export type NarrationSettings = z.infer<typeof NarrationSettingsSchema>;

export const AmbienceSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Bed level in dB, relative to the narration. */
  levelDb: z.number().min(BED_LEVEL_RANGE_DB.min).max(BED_LEVEL_RANGE_DB.max),
  /** How far beds dip under the voice, in dB. */
  duckingDb: z.number().min(DUCKING_RANGE_DB.min).max(DUCKING_RANGE_DB.max),
});

export const PlaybackSettingsSchema = z.object({
  /** Speed for a series that has not been given one yet. */
  defaultRate: z.number().min(PLAYBACK_RATE_RANGE.min).max(PLAYBACK_RATE_RANGE.max),
});
export type PlaybackSettings = z.infer<typeof PlaybackSettingsSchema>;

export const ReadingSettingsSchema = z.object({
  fontScale: z.number().min(0.8).max(1.6),
  showOriginal: z.boolean(),
});

/** Every user setting. Each top-level key is stored as its own row in the `settings` table. */
export const SettingsSchema = z.object({
  theme: ThemeModeSchema,
  uiLanguage: LangSchema,
  defaultTargetLang: LangSchema.nullable(),
  translationModel: ModelIdSchema,
  analysisModel: ModelIdSchema,
  cleanupModel: ModelIdSchema,
  narration: NarrationSettingsSchema,
  ambience: AmbienceSettingsSchema,
  playback: PlaybackSettingsSchema,
  reading: ReadingSettingsSchema,
  onboardingDone: z.boolean(),
  contentNoticeAccepted: z.boolean(),
  /** The user has answered the background-notification explainer (Allow or Not now). */
  notificationsExplained: z.boolean(),
  /** Set once the app has told the user that chapter preparation pauses in the background. */
  backgroundNoticeShown: z.boolean(),
  /**
   * Set once the notification sheet has been shown. It is never shown again, so a refusal is not
   * asked for twice. The settings screen is where the user can turn notifications on later.
   */
  notificationPromptShown: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingKeySchema = SettingsSchema.keyof();
export type SettingKey = z.infer<typeof SettingKeySchema>;

export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
