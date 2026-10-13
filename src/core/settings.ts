import { z } from 'zod';

import { LangSchema, NarrationProfileSchema } from './domain';
import { BED_LEVEL_RANGE_DB, DUCKING_RANGE_DB } from './playback/ranges';

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
  reading: ReadingSettingsSchema,
  onboardingDone: z.boolean(),
  contentNoticeAccepted: z.boolean(),
  /** Set once the app has told the user that chapter preparation pauses in the background. */
  backgroundNoticeShown: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingKeySchema = SettingsSchema.keyof();
export type SettingKey = z.infer<typeof SettingKeySchema>;

export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
