import { createSettingsStore } from './settings-store';
import { DEFAULT_SETTINGS } from '../../core/defaults';
import { createTestDb } from '../../db/__fixtures__/test-db';

const T0 = 1_700_000_000_000;

describe('settings store', () => {
  it('starts from the defaults and reads the saved values on hydrate', () => {
    const { db } = createTestDb();
    const first = createSettingsStore(() => T0);
    first.hydrate(db);
    first.patch({ theme: 'light' });

    const second = createSettingsStore(() => T0);
    second.hydrate(db);

    expect(second.getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'light',
    });
  });

  it('writes through to the database and publishes the saved settings', () => {
    const { db } = createTestDb();
    const store = createSettingsStore(() => T0);
    store.hydrate(db);

    store.patch({ reading: { fontScale: 1.25, showOriginal: true } });

    const published = store.getSettings();
    expect(published.reading).toEqual({ fontScale: 1.25, showOriginal: true });
    const reread = createSettingsStore();
    reread.hydrate(db);
    expect(reread.getSettings().reading).toEqual({
      fontScale: 1.25,
      showOriginal: true,
    });
  });

  it('refuses to save before hydrate, so nothing is written with no database', () => {
    const store = createSettingsStore();

    expect(() => store.patch({ theme: 'dark' })).toThrow(/before the library finished opening/);
  });

  it('keeps the previous settings when a patch is invalid', () => {
    const { db } = createTestDb();
    const store = createSettingsStore();
    store.hydrate(db);

    expect(() => store.patch({ theme: 'sepia' as never })).toThrow();
    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
