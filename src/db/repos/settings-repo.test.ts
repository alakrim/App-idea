import { settingsRepo } from './settings-repo';
import { DEFAULT_SETTINGS } from '../../core/defaults';
import { createTestDb } from '../__fixtures__/test-db';
import { settings } from '../schema';

import type { SettingKey } from '../../core/settings';

const T0 = 1_700_000_000_000;

function storeRaw(db: ReturnType<typeof createTestDb>['db'], key: string, value: string): void {
  db.insert(settings).values({ key, value, updatedAt: T0 }).run();
}

describe('settingsRepo', () => {
  it('returns the defaults when nothing is stored', () => {
    const { db } = createTestDb();

    expect(settingsRepo.getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('patches only the given keys and keeps the rest at their stored values', () => {
    const { db } = createTestDb();

    const first = settingsRepo.patchSettings(db, { theme: 'light', defaultTargetLang: 'it' }, T0);
    const second = settingsRepo.patchSettings(
      db,
      { ambience: { enabled: false, levelDb: -30, duckingDb: 6 } },
      T0 + 1,
    );

    expect(first).toEqual({ ...DEFAULT_SETTINGS, theme: 'light', defaultTargetLang: 'it' });
    expect(second).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'light',
      defaultTargetLang: 'it',
      ambience: { enabled: false, levelDb: -30, duckingDb: 6 },
    });
    expect(settingsRepo.getSettings(db)).toEqual(second);
  });

  it('stores one row per key and updates it in place', () => {
    const { db } = createTestDb();

    settingsRepo.patchSettings(db, { onboardingDone: true }, T0);
    settingsRepo.patchSettings(db, { onboardingDone: false }, T0 + 5);

    const rows = db.select().from(settings).all();
    expect(rows).toEqual([{ key: 'onboardingDone', value: 'false', updatedAt: T0 + 5 }]);
  });

  it('rejects an invalid patch and writes nothing', () => {
    const { db } = createTestDb();

    expect(() =>
      settingsRepo.patchSettings(
        db,
        { theme: 'light', reading: { fontScale: 9, showOriginal: false } },
        T0,
      ),
    ).toThrow();
    expect(db.select().from(settings).all()).toEqual([]);
  });

  it('rejects a malformed model id before saving', () => {
    const { db } = createTestDb();

    expect(() => settingsRepo.patchSettings(db, { analysisModel: 'gemini flash' }, T0)).toThrow();
  });

  it('resets invalid stored JSON to its default and warns once per key', () => {
    const { db } = createTestDb();
    storeRaw(db, 'theme', '{not json');
    storeRaw(db, 'reading', JSON.stringify({ fontScale: 'huge', showOriginal: true }));
    storeRaw(db, 'onboardingDone', 'true');
    const onInvalid = jest.fn<void, [SettingKey, string]>();

    const loaded = settingsRepo.getSettings(db, onInvalid);

    expect(loaded.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(loaded.reading).toEqual(DEFAULT_SETTINGS.reading);
    expect(loaded.onboardingDone).toBe(true);
    expect(onInvalid.mock.calls.map(([key]) => key).sort()).toEqual(['reading', 'theme']);
  });

  it('warns through console.warn by default, without echoing the stored value', () => {
    const { db } = createTestDb();
    storeRaw(db, 'uiLanguage', '"sk-or-v1-secret value!"');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(settingsRepo.getSettings(db).uiLanguage).toBe('en');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('uiLanguage');
      expect(String(warn.mock.calls[0]?.[0])).not.toContain('sk-or-v1');
    } finally {
      warn.mockRestore();
    }
  });

  it('ignores unknown keys', () => {
    const { db } = createTestDb();
    storeRaw(db, 'legacyFlag', 'true');

    expect(settingsRepo.getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});
