import { DEFAULT_SETTINGS } from '../../core/defaults';
import { SettingKeySchema, SettingsPatchSchema, SettingsSchema } from '../../core/settings';
import { settings } from '../schema';

import type { SettingKey, Settings, SettingsPatch } from '../../core/settings';
import type { Db } from '../types';

/** Called once per stored value that is ignored. The reason never includes the value itself. */
export type InvalidSettingHandler = (key: SettingKey, reason: string) => void;

export const warnInvalidSetting: InvalidSettingHandler = (key, reason) => {
  console.warn(`Lectio: ignoring stored setting "${key}" (${reason}) and using its default.`);
};

type ParsedValue<K extends SettingKey> =
  { ok: true; value: Settings[K] } | { ok: false; reason: string };

function parseStoredValue<K extends SettingKey>(key: K, raw: string): ParsedValue<K> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  const result = SettingsSchema.shape[key].safeParse(json);
  if (!result.success) {
    return { ok: false, reason: result.error.issues[0]?.message ?? 'schema mismatch' };
  }
  return { ok: true, value: result.data as Settings[K] };
}

function assign<K extends SettingKey>(target: Settings, key: K, value: Settings[K]): void {
  target[key] = value;
}

/**
 * The row of the retired notification primer. A stored `true` means the explainer was already
 * answered, so it reads as `notificationsExplained`. The row itself is never written again.
 */
const LEGACY_PRIMER_KEY = 'notificationPromptShown';

/**
 * Reads every setting. Missing keys take their defaults. A stored value that is not valid JSON or
 * fails its schema is reported through `onInvalid` and replaced by its default. Unknown keys are
 * ignored, except the legacy primer row, which counts as an answered explainer.
 */
function getSettings(db: Db, onInvalid: InvalidSettingHandler = warnInvalidSetting): Settings {
  const result: Settings = { ...DEFAULT_SETTINGS };
  let legacyPrimerAnswered = false;
  for (const row of db.select().from(settings).all()) {
    if (row.key === LEGACY_PRIMER_KEY) {
      legacyPrimerAnswered = row.value === 'true';
      continue;
    }
    const key = SettingKeySchema.safeParse(row.key);
    if (!key.success) continue;
    const parsed = parseStoredValue(key.data, row.value);
    if (parsed.ok) {
      assign(result, key.data, parsed.value);
    } else {
      onInvalid(key.data, parsed.reason);
    }
  }
  if (legacyPrimerAnswered) result.notificationsExplained = true;
  return result;
}

/**
 * Writes only the keys present in `patch`, in one transaction, and returns the full settings.
 * Throws a ZodError (and writes nothing) when a value is invalid.
 */
function patchSettings(db: Db, input: SettingsPatch, updatedAt: number): Settings {
  const validated = SettingsPatchSchema.parse(input);
  db.transaction((tx) => {
    for (const key of SettingKeySchema.options) {
      const value = validated[key];
      if (value === undefined) continue;
      const json = JSON.stringify(value);
      tx.insert(settings)
        .values({ key, value: json, updatedAt })
        .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt } })
        .run();
    }
  });
  return getSettings(db);
}

export const settingsRepo = { getSettings, patchSettings };
