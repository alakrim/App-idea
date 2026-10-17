// Polite HTTP for the sound scripts (brief SND1): one request per second, a descriptive User-Agent,
// and retries with backoff on 429 and 5xx. Responses are untrusted; callers validate them with zod.

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const USER_AGENT = 'LectioAmbienceCuration/1.0 (open-licence ambience sourcing for an audiobook app)';
const MIN_INTERVAL_MS = 1100;
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 120_000;

let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoffMs = (attempt) => 5000 * 2 ** (attempt - 1);

export async function politeGet(url, accept = '*/*') {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    let res;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`GET ${url} failed: ${err.message}`);
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
      continue;
    }
    throw new Error(`GET ${url} returned ${res.status}`);
  }
}

export async function getJson(url) {
  return (await politeGet(url, 'application/json')).json();
}

export async function getText(url) {
  return (await politeGet(url, 'text/html')).text();
}

/** Downloads `url` to `file` and returns the sha256 of the bytes as received (the "original"). */
export async function downloadFile(url, file) {
  const bytes = Buffer.from(await (await politeGet(url, 'audio/*, */*')).arrayBuffer());
  await writeFile(file, bytes);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}
