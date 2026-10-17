import { failureFromHttp } from './error-mapping';
import { PipelineFailure, pipelineFailure, redactFailure } from './errors';
import { isDailyLimit } from './rate-limit';
import { backoffDelayMs, parseRetryAfter } from './retry';
import { untilAborted } from '../network/abort';
import { createConnection } from '../network/connection';

import type { Connection } from '../network/connection';
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
  /** Retires an attempt when the connection goes stale, so it is retried at once. */
  connection?: Pick<Connection, 'register'>;
}

/**
 * How long one call may take, in milliseconds. Speech and chat replies are long, so they get more
 * time than the short calls (models, key). Every call stays abortable.
 */
export const CALL_TIMEOUTS_MS = { default: 60_000, chat: 120_000, speech: 180_000 } as const;

export interface TransportRequest {
  method: 'GET' | 'POST';
  /** Path below the base URL, for example `/models`. */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  accept: string;
  signal?: AbortSignal;
  /** How long this call may take. Defaults to the transport's timeout. */
  timeoutMs?: number;
  /** The copy shown when the free model's daily allowance is used up. */
  dailyLimitMessage?: string;
}

type BodyReader<T> = (res: Response) => Promise<T>;

export interface Transport {
  /** Runs one logical call: key lookup, timeout, retries, error mapping and body reading. */
  request<T>(req: TransportRequest, readBody: BodyReader<T>): Promise<T>;
}

/** The config once its defaults are filled in. */
type ResolvedConfig = TransportConfig & { readonly connection: Pick<Connection, 'register'> };

export function createTransport(options: TransportConfig): Transport {
  const config: ResolvedConfig = {
    ...options,
    connection: options.connection ?? createConnection(),
  };
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

/**
 * How many times a retired attempt is re-sent at once. A retirement is free only while no reply has
 * arrived; the cap stops a connection that keeps going stale from looping forever.
 */
const MAX_STALE_RETRIES = 2;

/**
 * An attempt retired because the connection went stale, before any reply arrived. It is a retryable
 * NETWORK failure, tagged `stale`, so the retry loop can tell it from a server or network failure: it
 * is retried at once, without backoff, and it does not count against maxRetries.
 */
function staleFailure(): PipelineFailure {
  return pipelineFailure('NETWORK', 'The connection was interrupted. Retrying…', {
    retryable: true,
    detail: 'stale connection',
    stale: true,
  });
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
  config: ResolvedConfig,
  req: TransportRequest,
  apiKey: string,
  readBody: BodyReader<T>,
): Promise<T> {
  let retries = 0;
  let staleRetries = 0;
  for (;;) {
    try {
      return await attemptOnce(config, req, apiKey, readBody);
    } catch (error) {
      const failure = asFailure(error);
      // A retired attempt is retried at once: it is not a server failure, so it spends no retry.
      if (failure.stale && staleRetries < MAX_STALE_RETRIES) {
        staleRetries += 1;
        continue;
      }
      if (!failure.error.retryable || retries >= config.maxRetries) throw failure;
      const delay = backoffDelayMs(retries, config.random, failure.retryAfterMs);
      await waitBeforeRetry(config, delay, req.signal);
      retries += 1;
    }
  }
}

async function attemptOnce<T>(
  config: ResolvedConfig,
  req: TransportRequest,
  apiKey: string,
  readBody: BodyReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let retired = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, req.timeoutMs ?? config.timeoutMs);
  const forwardAbort = () => controller.abort();
  req.signal?.addEventListener('abort', forwardAbort);
  const unregister = config.connection.register({
    timeoutMs: req.timeoutMs ?? config.timeoutMs,
    retire: () => {
      retired = true;
      controller.abort();
    },
  });

  try {
    if (req.signal?.aborted) throw cancelledFailure();
    // Native fetch and body reads on a dead socket can ignore their abort signal, so each wait is
    // also bounded by the attempt's own signal: a retired attempt ends here, not when fetch does.
    const res = await untilAborted(
      config.fetchImpl(buildUrl(config.baseUrl, req), {
        method: req.method,
        headers: buildHeaders(config, req, apiKey),
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      }),
      controller.signal,
    );
    // Headers are in: the reply is paid for and is being read. Leaving the connection's in-flight
    // set now means a retirement can never abort that read and re-send the request (QA-F F-01).
    unregister();
    if (!res.ok) {
      const bodyText = await untilAborted(
        res.text().catch(() => ''),
        controller.signal,
      );
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
    return await untilAborted(readBody(res), controller.signal);
  } catch (error) {
    if (error instanceof PipelineFailure) throw error;
    // The caller's own cancellation wins over a retirement, so a cancelled call is never retried.
    if (req.signal?.aborted) throw cancelledFailure();
    if (retired) throw staleFailure();
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
    unregister();
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
