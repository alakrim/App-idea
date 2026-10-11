import { z } from 'zod';

import { pipelineFailure } from './errors';

import type { PipelineFailure } from './errors';

const errorBodySchema = z.object({
  error: z
    .object({
      message: z.string().nullish(),
      metadata: z.object({ limit_source: z.string().nullish() }).nullish(),
    })
    .nullish(),
});

/** 402 `metadata.limit_source` for a transient in-flight budget (R1 section 4). */
const IN_FLIGHT_BUDGET_SOURCE = 'openrouter_in_flight_budget';

/** Matches OpenRouter's "this model cannot be served" messages, which arrive as 400 or 404. */
const MODEL_UNAVAILABLE_PATTERN =
  /model[^.]*not (found|available|exist)|no endpoints|not a valid model|unknown model/i;

interface UpstreamError {
  message: string | null;
  limitSource: string | null;
}

function readUpstreamError(bodyText: string): UpstreamError {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return { message: null, limitSource: null };
  }
  const parsed = errorBodySchema.safeParse(json);
  if (!parsed.success) return { message: null, limitSource: null };
  return {
    message: parsed.data.error?.message ?? null,
    limitSource: parsed.data.error?.metadata?.limit_source ?? null,
  };
}

/**
 * Maps a non-2xx OpenRouter response to a PipelineFailure. The user-facing message is always a
 * fixed string. The upstream text only goes to `detail`, and the caller redacts it.
 */
export function failureFromHttp(
  status: number,
  bodyText: string,
  retryAfterMs: number | null,
): PipelineFailure {
  const upstream = readUpstreamError(bodyText);
  const detail = upstream.message ?? `HTTP ${status}`;
  const limitSource = upstream.limitSource ?? '';

  if (status === 401) {
    return pipelineFailure('AUTH', 'Your OpenRouter key was rejected. Check it in Settings.', {
      retryable: false,
      detail,
    });
  }
  if (status === 402) {
    // The per-key in-flight budget frees up again on its own, so it is a retryable wait.
    if (limitSource === IN_FLIGHT_BUDGET_SOURCE) {
      return pipelineFailure(
        'RATE_LIMITED',
        'OpenRouter is busy right now. Wait a moment and try again.',
        { retryable: true, detail, retryAfterMs },
      );
    }
    return pipelineFailure(
      'INSUFFICIENT_CREDITS',
      'Your OpenRouter credits have run out. Add credits, then try again.',
      { retryable: false, detail },
    );
  }
  if (status === 403) {
    if (/budget|key_limit/.test(limitSource)) {
      return pipelineFailure(
        'INSUFFICIENT_CREDITS',
        'Your OpenRouter spending limit has been reached. Raise it or wait for it to reset.',
        { retryable: false, detail },
      );
    }
    return pipelineFailure(
      'AUTH',
      'OpenRouter refused this request for your key. Check its settings in OpenRouter.',
      { retryable: false, detail },
    );
  }
  if (status === 404 || (status === 400 && MODEL_UNAVAILABLE_PATTERN.test(detail))) {
    return pipelineFailure(
      'MODEL_UNAVAILABLE',
      'This model is not available on OpenRouter right now. Choose another one in Settings.',
      { retryable: false, detail },
    );
  }
  if (status === 408) {
    return pipelineFailure('NETWORK', 'OpenRouter took too long to answer. Try again.', {
      retryable: true,
      detail,
    });
  }
  if (status === 429) {
    return pipelineFailure(
      'RATE_LIMITED',
      'OpenRouter is busy right now. Wait a moment and try again.',
      {
        retryable: true,
        detail,
        retryAfterMs,
      },
    );
  }
  if (status >= 500) {
    return pipelineFailure(
      'UNKNOWN',
      'OpenRouter is having trouble right now. Try again shortly.',
      {
        retryable: true,
        detail,
      },
    );
  }
  return pipelineFailure('UNKNOWN', 'OpenRouter could not complete this request. Try again.', {
    retryable: false,
    detail,
  });
}
