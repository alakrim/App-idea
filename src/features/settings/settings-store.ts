import { create } from 'zustand';

import { DEFAULT_SETTINGS } from '../../core/defaults';
import { settingsRepo } from '../../db/repos/settings-repo';

import type { Settings, SettingsPatch } from '../../core/settings';
import type { Db } from '../../db/types';

interface SettingsState {
  settings: Settings;
  /** True once `hydrate` has read the saved settings. */
  hydrated: boolean;
}

export interface SettingsStore {
  /** Reads the saved settings. Call once the database is migrated, before any screen renders. */
  hydrate(db: Db): void;
  /** Saves the given keys to the database, then publishes the full settings. */
  patch(patch: SettingsPatch): void;
  /** The settings as last published. For code that is not a React component. */
  getSettings(): Settings;
  /** React hook over the current settings. */
  useSettingsState<T>(selector: (state: SettingsState) => T): T;
}

export function createSettingsStore(now: () => number = Date.now): SettingsStore {
  let database: Db | null = null;
  const store = create<SettingsState>()(() => ({ settings: DEFAULT_SETTINGS, hydrated: false }));

  return {
    hydrate(db) {
      database = db;
      store.setState({ settings: settingsRepo.getSettings(db), hydrated: true });
    },
    patch(patch) {
      if (database === null) {
        throw new Error('Settings were changed before the library finished opening.');
      }
      store.setState({ settings: settingsRepo.patchSettings(database, patch, now()) });
    },
    getSettings: () => store.getState().settings,
    useSettingsState: store,
  };
}

export const settingsStore = createSettingsStore();

/** The current settings, plus `patch` to change them. Writes go straight to the database. */
export function useSettings(): { settings: Settings; patch: (patch: SettingsPatch) => void } {
  const settings = settingsStore.useSettingsState((state) => state.settings);
  return { settings, patch: settingsStore.patch };
}
