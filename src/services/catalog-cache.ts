import { File, Paths } from 'expo-file-system';

/**
 * Best-effort persistence for the OpenRouter model catalog snapshot (`ModelCatalog.serialize()`).
 * The cache is a speed-up, not a source of truth: every read or write failure is swallowed and
 * the app fetches the catalog again.
 */

const CACHE_FILE_NAME = 'openrouter-models.json';

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
