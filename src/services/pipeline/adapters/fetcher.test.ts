import { StageFailure } from '@/core/pipeline/errors';
import type { FetchLimits } from '@/core/pipeline/ports';
import { createConnection } from '@/services/network/connection';

import { createFetcher, isReadableContentType, MOBILE_USER_AGENT } from './fetcher';

const LIMITS: FetchLimits = { maxBytes: 1024, timeoutMs: 1000 };
const HTML = '<html><body><p>Hello.</p></body></html>';

function htmlResponse(body: string | ArrayBuffer, init: ResponseInit = {}): Response {
  const headers = { 'content-type': 'text/html; charset=utf-8', ...(init.headers ?? {}) };
  return new Response(body, { ...init, headers });
}

function fetchOf(response: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function catchError(promise: Promise<unknown>): Promise<StageFailure | Error> {
  try {
    await promise;
  } catch (thrown) {
    return thrown as StageFailure | Error;
  }
  throw new Error('expected a rejection');
}

describe('createFetcher', () => {
  it('fetches with the mobile user agent, follows redirects, and returns the final url', async () => {
    const { fetchImpl, calls } = fetchOf(() => {
      const res = htmlResponse(HTML);
      Object.defineProperty(res, 'url', { value: 'https://example.com/final' });
      return res;
    });
    const fetcher = createFetcher({ fetchImpl });

    const result = await fetcher.fetch(
      'https://example.com/a',
      new AbortController().signal,
      LIMITS,
    );

    expect(result.finalUrl).toBe('https://example.com/final');
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(new TextDecoder().decode(result.bytes)).toBe(HTML);
    expect(calls[0]?.init?.redirect).toBe('follow');
    expect(calls[0]?.init?.headers).toEqual(
      expect.objectContaining({ 'User-Agent': MOBILE_USER_AGENT }),
    );
  });

  it('refuses a streamed body that passes the size limit', async () => {
    const big = new Uint8Array(2048).fill(97).buffer;
    const fetcher = createFetcher({ fetchImpl: fetchOf(() => htmlResponse(big)).fetchImpl });
    const error = await catchError(
      fetcher.fetch('https://example.com/a', new AbortController().signal, LIMITS),
    );
    expect(error).toBeInstanceOf(StageFailure);
    expect((error as StageFailure).error).toMatchObject({
      code: 'INPUT_TOO_LONG',
      retryable: false,
    });
  });

  it('refuses an unstreamed body over the limit when no stream reader is available', async () => {
    // React Native's fetch exposes no body stream, so the whole body is read and then checked.
    const unstreamed = new Response(new Uint8Array(2048).fill(97)) as Response;
    Object.defineProperty(unstreamed, 'body', { value: null });
    const fetcher = createFetcher({ fetchImpl: fetchOf(() => unstreamed).fetchImpl });
    await expect(
      fetcher.fetch('https://example.com/a', new AbortController().signal, LIMITS),
    ).rejects.toMatchObject({ error: { code: 'INPUT_TOO_LONG', retryable: false } });
  });

  it('accepts an unstreamed body within the limit', async () => {
    const unstreamed = htmlResponse(HTML);
    Object.defineProperty(unstreamed, 'body', { value: null });
    const fetcher = createFetcher({ fetchImpl: fetchOf(() => unstreamed).fetchImpl });
    const result = await fetcher.fetch(
      'https://example.com/a',
      new AbortController().signal,
      LIMITS,
    );
    expect(new TextDecoder().decode(result.bytes)).toBe(HTML);
  });

  it('refuses a declared size over the limit before reading the body', async () => {
    const fetcher = createFetcher({
      fetchImpl: fetchOf(() => htmlResponse(HTML, { headers: { 'content-length': '999999' } }))
        .fetchImpl,
    });
    await expect(
      fetcher.fetch('https://example.com/a', new AbortController().signal, LIMITS),
    ).rejects.toMatchObject({ error: { code: 'INPUT_TOO_LONG' } });
  });

  it('rejects a PDF or an image with a clear, non-retryable message', async () => {
    const fetcher = createFetcher({
      fetchImpl: fetchOf(() =>
        htmlResponse('%PDF', { headers: { 'content-type': 'application/pdf' } }),
      ).fetchImpl,
    });
    await expect(
      fetcher.fetch('https://example.com/a.pdf', new AbortController().signal, LIMITS),
    ).rejects.toMatchObject({
      error: { code: 'CONTENT_EMPTY', retryable: false, detail: 'content_type=application/pdf' },
    });
  });

  it('maps HTTP statuses to pipeline errors', async () => {
    const cases: [number, string, boolean][] = [
      [403, 'CONTENT_BLOCKED', false],
      [404, 'CONTENT_EMPTY', false],
      [503, 'NETWORK', true],
      [429, 'NETWORK', true],
    ];
    for (const [status, code, retryable] of cases) {
      const fetcher = createFetcher({
        fetchImpl: fetchOf(() => new Response('', { status })).fetchImpl,
      });
      await expect(
        fetcher.fetch('https://example.com/a', new AbortController().signal, LIMITS),
      ).rejects.toMatchObject({ error: { code, retryable } });
    }
  });

  it('reports a network failure as retryable', async () => {
    const fetcher = createFetcher({
      fetchImpl: (async () => {
        throw new TypeError('Network request failed');
      }) as typeof fetch,
    });
    await expect(
      fetcher.fetch('https://example.com/a', new AbortController().signal, LIMITS),
    ).rejects.toMatchObject({ error: { code: 'NETWORK', retryable: true } });
  });

  it('times out a request that does not answer, as a retryable network failure', async () => {
    const fetcher = createFetcher({
      fetchImpl: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        })) as typeof fetch,
    });
    await expect(
      fetcher.fetch('https://example.com/a', new AbortController().signal, {
        ...LIMITS,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ error: { code: 'NETWORK', detail: 'timeout', retryable: true } });
  });

  it('aborts with an AbortError when the caller cancels', async () => {
    const caller = new AbortController();
    const fetcher = createFetcher({
      fetchImpl: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        })) as typeof fetch,
    });
    const pending = fetcher.fetch('https://example.com/a', caller.signal, LIMITS);
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('isReadableContentType', () => {
  it('accepts HTML and plain text, with or without parameters, and unknown types', () => {
    expect(isReadableContentType('Text/HTML; charset=utf-8')).toBe(true);
    expect(isReadableContentType('application/xhtml+xml')).toBe(true);
    expect(isReadableContentType('text/plain')).toBe(true);
    expect(isReadableContentType(null)).toBe(true);
    expect(isReadableContentType('application/pdf')).toBe(false);
    expect(isReadableContentType('image/png')).toBe(false);
  });
});

describe('createFetcher: a page request retired by the connection', () => {
  const URL = 'https://example.com/a';

  /** A fetch that hangs on its first call, until the signal aborts, and answers the rest. */
  function hangFirst(onAbortIgnored: boolean) {
    let attempts = 0;
    return {
      get attempts() {
        return attempts;
      },
      fetchImpl: ((_url: string, init?: RequestInit) => {
        attempts += 1;
        if (attempts > 1) return Promise.resolve(htmlResponse(HTML));
        if (onAbortIgnored) return new Promise<Response>(() => undefined);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        });
      }) as typeof fetch,
    };
  }

  it('is fetched again at once, and the retirement is not reported as a failure', async () => {
    const connection = createConnection();
    const page = hangFirst(false);
    const fetcher = createFetcher({ connection, fetchImpl: page.fetchImpl });

    const pending = fetcher.fetch(URL, new AbortController().signal, LIMITS);
    expect(connection.retireInFlight()).toBe(1);

    await expect(pending).resolves.toMatchObject({ contentType: 'text/html; charset=utf-8' });
    expect(page.attempts).toBe(2);
  });

  it('settles even when the fetch ignores its abort, as a dead socket can', async () => {
    const connection = createConnection();
    const page = hangFirst(true);
    const fetcher = createFetcher({ connection, fetchImpl: page.fetchImpl });

    const pending = fetcher.fetch(URL, new AbortController().signal, LIMITS);
    connection.retireInFlight();

    await expect(pending).resolves.toMatchObject({ contentType: 'text/html; charset=utf-8' });
    expect(page.attempts).toBe(2);
  });

  it('still reports the caller’s cancellation, not a retirement', async () => {
    const connection = createConnection();
    const caller = new AbortController();
    const page = hangFirst(false);
    const fetcher = createFetcher({ connection, fetchImpl: page.fetchImpl });

    const pending = fetcher.fetch(URL, caller.signal, LIMITS);
    caller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(page.attempts).toBe(1);
  });
});
