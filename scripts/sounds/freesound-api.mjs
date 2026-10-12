// Freesound API v2 client for the A3 scripts. Search and sound metadata need the API key, which is
// sent as an Authorization header and never placed in a URL or an error message. Preview downloads
// are plain CDN GETs with no key. Every API call is throttled and retried on 429 and 5xx.

import { Buffer } from 'node:buffer';

import { z } from 'zod';

import { FREESOUND_MAX_RETRIES, FREESOUND_MIN_INTERVAL_MS } from './pack-spec.mjs';

const API_ROOT = 'https://freesound.org/apiv2';
/** The fields the curation and the build read. Keep this list in sync with the schema below. */
export const SOUND_FIELDS = [
  'id',
  'name',
  'tags',
  'description',
  'duration',
  'license',
  'avg_rating',
  'num_ratings',
  'num_downloads',
  'username',
  'url',
  'previews',
  'samplerate',
  'channels',
].join(',');

export const soundSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  tags: z.array(z.string()),
  duration: z.number().positive(),
  license: z.string(),
  avg_rating: z.number().min(0).max(5),
  num_ratings: z.number().int().nonnegative(),
  num_downloads: z.number().int().nonnegative(),
  username: z.string().min(1),
  url: z.string().url(),
  previews: z.object({ 'preview-hq-mp3': z.string().url() }),
  samplerate: z.number().positive(),
  channels: z.number().int().positive(),
});

const searchResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().nullable(),
  results: z.array(soundSchema),
});

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const defaultLog = (message) => console.warn(message);

/** Milliseconds to wait before a retry: the server's Retry-After when given, else exponential backoff. */
function retryDelayMs(response, attempt) {
  const header = response.headers?.get?.('retry-after');
  const seconds = header === undefined || header === null ? Number.NaN : Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 120) * 1000;
  return 2 ** attempt * 2000;
}

/**
 * Creates a throttled client. `fetchImpl`, `sleep` and `now` are injected so tests run without the
 * network or the clock. Throws at creation when the key is missing, so no request is ever sent without one.
 */
export function createFreesoundClient({
  apiKey,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = Date.now,
  minIntervalMs = FREESOUND_MIN_INTERVAL_MS,
  maxRetries = FREESOUND_MAX_RETRIES,
  log = defaultLog,
}) {
  if (!apiKey) {
    throw new Error(
      'FREESOUND_API_KEY is not set. Run with FREESOUND_API_KEY=$(cat ~/.config/lectio/freesound.key).',
    );
  }

  let nextSlot = 0;
  /** Reserves the next request slot so requests never start closer than `minIntervalMs` apart. */
  async function throttle() {
    const start = Math.max(now(), nextSlot);
    nextSlot = start + minIntervalMs;
    const wait = start - now();
    if (wait > 0) await sleep(wait);
  }

  async function getJson(path, params, schema) {
    const url = new URL(`${API_ROOT}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    for (let attempt = 0; ; attempt++) {
      await throttle();
      const response = await fetchImpl(url, {
        headers: { Authorization: `Token ${apiKey}`, Accept: 'application/json' },
      });
      if (response.ok) return schema.parse(await response.json());
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxRetries) {
        const waitMs = retryDelayMs(response, attempt);
        log(
          `Freesound ${path} returned HTTP ${response.status}; retrying in ${Math.round(waitMs / 1000)} s`,
        );
        await sleep(waitMs);
        continue;
      }
      const hint =
        response.status === 401 || response.status === 403 ? ' (check FREESOUND_API_KEY)' : '';
      throw new Error(`Freesound ${path} failed with HTTP ${response.status}${hint}`);
    }
  }

  return {
    /** One page of text search, restricted by `filter` (see CC0_FILTER). */
    search({ query, filter, pageSize = 30 }) {
      return getJson(
        '/search/text/',
        { query, filter, page_size: pageSize, fields: SOUND_FIELDS },
        searchResponseSchema,
      );
    },
    /** Metadata for one sound, used to re-check the licence before a build. */
    sound(id) {
      return getJson(`/sounds/${id}/`, { fields: SOUND_FIELDS }, soundSchema);
    },
    /** Downloads the HQ MP3 preview bytes. CDN GET, no key, no API throttle, one retry on failure. */
    async downloadPreview(url) {
      for (let attempt = 0; ; attempt++) {
        const response = await fetchImpl(url);
        if (response.ok) return Buffer.from(await response.arrayBuffer());
        if (attempt >= 1 || response.status < 500) {
          throw new Error(`preview download failed with HTTP ${response.status}`);
        }
        await sleep(2000);
      }
    },
  };
}
