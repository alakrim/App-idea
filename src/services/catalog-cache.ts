import { File, Paths } from 'expo-file-system';

import type { ModelCatalog } from './openrouter/models';

/**
 * Best-effort persistence for the OpenRouter model catalogue snapshot. The catalogue is restored
 * from the cache file on its first use, and the file is rewritten only after a fetch changed the
 * catalogue. The cache is a speed-up, not a source of truth: every read or write failure is
 * swallowed and the app fetches the catalogue again.
 */

const CACHE_FILE_NAME = 'openrouter-models.json';

/** Where a catalogue snapshot is kept between launches. */
export interface CatalogStore {
  /** The last saved snapshot, or null when there is none or it cannot be read. */
  read(): string | null;
  write(payload: string): void;
}

function cacheFile(): File {
  return new File(Paths.cache, CACHE_FILE_NAME);
}

/** The last saved snapshot, or null when there is none or it cannot be read. */
export function readCatalogSnapshot(): string | null {
  try {
    const file = cacheFile();
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

export function writeCatalogSnapshot(payload: string): void {
  try {
    const file = cacheFile();
    file.create({ intermediates: true, overwrite: true });
    file.write(payload);
  } catch {
    // Losing the cache costs one extra request on the next launch. Nothing else depends on it.
  }
}

/** The app's cache file. */
export const CATALOG_FILE_STORE: CatalogStore = {
  read: readCatalogSnapshot,
  write: writeCatalogSnapshot,
};

/**
 * Wraps a catalogue so that it is restored from `store` on its first `list` call, which keeps file
 * I/O out of building the client. A `list` that fetched and changed the catalogue writes the
 * snapshot back. A cache hit, and a failed fetch, write nothing.
 */
export function persistCatalog(
  models: ModelCatalog,
  store: CatalogStore = CATALOG_FILE_STORE,
): ModelCatalog {
  let restored = false;
  let saved: string | null = null;

  const restoreOnce = (): void => {
    if (restored) return;
    restored = true;
    const payload = store.read();
    if (payload !== null) models.hydrate(payload);
    saved = models.serialize();
  };

  return {
    async list(options) {
      restoreOnce();
      const result = await models.list(options);
      const payload = models.serialize();
      if (payload !== saved) {
        saved = payload;
        store.write(payload);
      }
      return result;
    },
    serialize: () => models.serialize(),
    hydrate: (payload) => models.hydrate(payload),
  };
}
