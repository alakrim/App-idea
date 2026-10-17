/*
 * Fetcher: one HTML or text page, fetched with a mobile browser user agent, following redirects.
 * The body is read as a stream and refused as soon as it passes the size limit. A timeout and the
 * caller's signal both abort the request. Every failure is a PipelineError the runner can show.
 */
import { StageFailure } from '@/core/pipeline/errors';
import type { Fetcher, FetchLimits, FetchResult } from '@/core/pipeline/ports';
import { untilAborted } from '@/services/network/abort';
import { createConnection } from '@/services/network/connection';
import type { Connection } from '@/services/network/connection';

/** A current Chrome on Android. Some sites serve a cut-down page to unknown agents. */
export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const ACCEPT = 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1';
const READABLE_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];

export function isReadableContentType(contentType: string | null): boolean {
  if (contentType === null) return true;
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return READABLE_TYPES.includes(type);
}

function aborted(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

/** A page request the connection retired. Internal: the fetch loop retries it at once. */
class RetiredRequest extends Error {}

export interface FetcherDeps {
  readonly fetchImpl?: typeof fetch;
  /** Retires a page request when the connection goes stale, so it is fetched again at once. */
  readonly connection?: Pick<Connection, 'register'>;
}

export function createFetcher({
  fetchImpl = fetch,
  connection = createConnection(),
}: FetcherDeps = {}): Fetcher {
  return {
    async fetch(url, signal, limits: FetchLimits): Promise<FetchResult> {
      for (;;) {
        try {
          return await fetchOnce(fetchImpl, connection, url, signal, limits);
        } catch (thrown) {
          if (!(thrown instanceof RetiredRequest)) throw thrown;
        }
      }
    },
  };
}

async function fetchOnce(
  fetchImpl: typeof fetch,
  connection: Pick<Connection, 'register'>,
  url: string,
  signal: AbortSignal,
  limits: FetchLimits,
): Promise<FetchResult> {
  if (signal.aborted) throw aborted();
  const controller = new AbortController();
  let timedOut = false;
  let retired = false;
  const onCallerAbort = () => controller.abort();
  signal.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limits.timeoutMs);
  const unregister = connection.register({
    timeoutMs: limits.timeoutMs,
    retire: () => {
      retired = true;
      controller.abort();
    },
  });

  try {
    const response = await untilAborted(
      requestPage(fetchImpl, url, controller.signal, () => {
        if (signal.aborted) throw aborted();
        if (timedOut) throw timeoutFailure();
        throw networkFailure();
      }),
      controller.signal,
    );
    assertUsableResponse(response);
    const contentType = response.headers.get('content-type');
    if (!isReadableContentType(contentType)) throw unreadableType(contentType);
    const declared = Number(response.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared > limits.maxBytes) throw tooLarge();
    const bytes = await untilAborted(
      readBody(response, limits.maxBytes, controller.signal),
      controller.signal,
    );
    return { bytes, contentType, finalUrl: response.url || url };
  } catch (thrown) {
    if (signal.aborted) throw aborted();
    if (retired) throw new RetiredRequest();
    if (timedOut && !(thrown instanceof StageFailure)) throw timeoutFailure();
    throw thrown;
  } finally {
    clearTimeout(timer);
    unregister();
    signal.removeEventListener('abort', onCallerAbort);
  }
}

async function requestPage(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal,
  onFailure: () => never,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      redirect: 'follow',
      signal,
      headers: { 'User-Agent': MOBILE_USER_AGENT, Accept: ACCEPT },
    });
  } catch {
    return onFailure();
  }
}

function assertUsableResponse(response: Response): void {
  if (response.ok) return;
  const { status } = response;
  if (status === 401 || status === 403) {
    throw new StageFailure(
      'CONTENT_BLOCKED',
      'This site will not let the app read the page. Paste the text instead.',
      { retryable: false, detail: `http_${status}` },
    );
  }
  if (status === 404 || status === 410) {
    throw new StageFailure('CONTENT_EMPTY', 'We could not find a page at this link.', {
      retryable: false,
      detail: `http_${status}`,
    });
  }
  if (status === 429 || status >= 500) {
    throw new StageFailure('NETWORK', 'The site is busy right now. Try again in a little while.', {
      retryable: true,
      detail: `http_${status}`,
    });
  }
  throw new StageFailure('UNKNOWN', 'The page could not be loaded. Try again.', {
    retryable: false,
    detail: `http_${status}`,
  });
}

function unreadableType(contentType: string | null): StageFailure {
  return new StageFailure(
    'CONTENT_EMPTY',
    'This link is not a web page or a text file. Use the PDF option for PDF files.',
    { retryable: false, detail: `content_type=${contentType ?? 'unknown'}` },
  );
}

function tooLarge(): StageFailure {
  return new StageFailure(
    'INPUT_TOO_LONG',
    'This page is too large to be a single chapter. Paste the part you want instead.',
    { retryable: false, detail: 'over_size_limit' },
  );
}

function timeoutFailure(): StageFailure {
  return new StageFailure('NETWORK', 'The page took too long to load. Try again.', {
    retryable: true,
    detail: 'timeout',
  });
}

function networkFailure(): StageFailure {
  return new StageFailure(
    'NETWORK',
    "We couldn't reach this page. Check your connection, then try again.",
    {
      retryable: true,
    },
  );
}

/**
 * Reads the body up to `maxBytes`. A streaming body is refused as soon as it passes the limit. A
 * runtime without a readable stream (React Native's fetch) reads the whole body, then checks it.
 */
async function readBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw tooLarge();
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw aborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
