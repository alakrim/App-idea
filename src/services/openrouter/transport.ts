import { failureFromHttp } from './error-mapping';
import { PipelineFailure, pipelineFailure, redactFailure } from './errors';
import { isDailyLimit } from './rate-limit';
import { backoffDelayMs, parseRetryAfter } from './retry';

import type { ZodType } from 'zod';

export interface TransportConfig {
  getApiKey: () => Promise<string | null>;
  fetchImpl: typeof fetch;
  baseUrl: string;
  appUrl: string;
  appTitle: string;
  timeoutMs: number;
  maxRetries: number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  now: () => number;
}

export interface TransportRequest {
  method: 'GET' | 'POST';
  /** Path below the base URL, for example `/models`. */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  accept: string;
  signal?: AbortSignal;
  /** Overrides the client's timeout for this call, for requests that carry long work, such as speech. */
  timeoutMs?: number;
  /** The copy shown when the free model's daily allowance is used up. */
  dailyLimitMessage?: string;
}

type BodyReader<T> = (res: Response) => Promise<T>;

export interface Transport {
  /** Runs one logical call: key lookup, timeout, retries, error mapping and body reading. */
  request<T>(req: TransportRequest, readBody: BodyReader<T>): Promise<T>;
}

export function createTransport(config: TransportConfig): Transport {
  return {
    async request<T>(req: TransportRequest, readBody: BodyReader<T>): Promise<T> {
      const apiKey = await readApiKey(config.getApiKey);
      try {
        return await withRetries(config, req, apiKey, readBody);
      } catch (error) {
        throw redactFailure(asFailure(error), apiKey);
      }
    },
  };
}

/** Reads a JSON body and validates it. A reply that fails validation is PARSE_FAILED. */
export function jsonBody<T>(schema: ZodType<T>): BodyReader<T> {
  return async (res) => {
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw parseFailure('not JSON');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw parseFailure(parsed.error.issues[0]?.message ?? 'invalid shape');
    return parsed.data;
  };
}

function parseFailure(detail: string): PipelineFailure {
  return pipelineFailure(
    'PARSE_FAILED',
    'OpenRouter sent a reply the app could not read. Try again.',
    { retryable: true, detail },
  );
}

function cancelledFailure(): PipelineFailure {
  return pipelineFailure('CANCELLED', 'Cancelled.', { retryable: false });
}

async function readApiKey(getApiKey: () => Promise<string | null>): Promise<string> {
  let key: string | null;
  try {
    key = await getApiKey();
  } catch {
    throw pipelineFailure(
      'UNKNOWN',
      'Could not read your OpenRouter key from secure storage. Try again.',
      { retryable: false },
    );
  }
  const trimmed = key?.trim();
  if (!trimmed) {
    throw pipelineFailure('AUTH', 'Add your OpenRouter key in Settings to continue.', {
      retryable: false,
    });
  }
  return trimmed;
}

async function withRetries<T>(
  config: TransportConfig,
  req: TransportRequest,
  apiKey: string,
  readBody: BodyReader<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await attemptOnce(config, req, apiKey, readBody);
    } catch (error) {
      const failure = asFailure(error);
      if (!failure.error.retryable || attempt >= config.maxRetries) throw failure;
      const delay = backoffDelayMs(attempt, config.random, failure.retryAfterMs);
      await waitBeforeRetry(config, delay, req.signal);
    }
  }
}

async function attemptOnce<T>(
  config: TransportConfig,
  req: TransportRequest,
  apiKey: string,
  readBody: BodyReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, req.timeoutMs ?? config.timeoutMs);
  const forwardAbort = () => controller.abort();
  req.signal?.addEventListener('abort', forwardAbort);

  try {
    if (req.signal?.aborted) throw cancelledFailure();
    const res = await config.fetchImpl(buildUrl(config.baseUrl, req), {
      method: req.method,
      headers: buildHeaders(config, req, apiKey),
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw failureFromHttp(
        res.status,
        bodyText,
        parseRetryAfter(res.headers.get('retry-after'), config.now),
        {
          daily: isDailyLimit(bodyText, res.headers, config.now()),
          ...(req.dailyLimitMessage === undefined ? {} : { dailyMessage: req.dailyLimitMessage }),
        },
      );
    }
    return await readBody(res);
  } catch (error) {
    if (error instanceof PipelineFailure) throw error;
    if (req.signal?.aborted) throw cancelledFailure();
    if (timedOut) {
      throw pipelineFailure('NETWORK', 'OpenRouter took too long to answer. Try again.', {
        retryable: true,
      });
    }
    throw pipelineFailure(
      'NETWORK',
      'No connection to OpenRouter. Check your network and try again.',
      {
        retryable: true,
        detail: error instanceof Error ? error.name : 'unknown error',
      },
    );
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', forwardAbort);
  }
}

function buildUrl(baseUrl: string, req: TransportRequest): string {
  const query = Object.entries(req.query ?? {})
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${baseUrl}${req.path}${query ? `?${query}` : ''}`;
}

function buildHeaders(
  config: TransportConfig,
  req: TransportRequest,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': config.appUrl,
    'X-Title': config.appTitle,
    'X-OpenRouter-Title': config.appTitle,
    Accept: req.accept,
  };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  return headers;
}

async function waitBeforeRetry(
  config: TransportConfig,
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) throw cancelledFailure();
  if (!signal) {
    await config.sleep(delayMs);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(cancelledFailure());
    signal.addEventListener('abort', onAbort, { once: true });
    config.sleep(delayMs).then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function asFailure(error: unknown): PipelineFailure {
  if (error instanceof PipelineFailure) return error;
  return pipelineFailure('UNKNOWN', 'Something went wrong. Try again.', {
    retryable: false,
    detail: error instanceof Error ? error.name : 'unknown error',
  });
}
