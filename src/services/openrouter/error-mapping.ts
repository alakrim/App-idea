import { z } from 'zod';

import { TOO_LARGE_TO_READ } from '@/core/extract/select';

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
  /model[^.]*not (found|available|exist|supported)|no endpoints|not a valid model|unknown model/i;

/** A 400 that says the prompt is longer than the model's context window. */
const CONTEXT_LENGTH_PATTERN =
  /context (length|window)|maximum context|too many tokens|prompt is too long|reduce the (length|input)/i;

/** A 400 that refuses a setting: "Gemini TTS only supports response_format=\"pcm\"", "not supported". */
const REFUSED_SETTING_PATTERN =
  /unsupported|not supported|does not support|doesn't support|only supports/i;
/** The refused setting is an audio format, so the message can name the format. */
const AUDIO_FORMAT_PATTERN = /\b(pcm|mp3|wav|opus|flac|aac)\b|audio format|output format/i;

/** What the transport learned about a 429: whether it is a daily allowance, and the copy for it. */
interface LimitContext {
  daily: boolean;
  /** The user-facing copy for a daily limit. Each feature words its own. */
  dailyMessage?: string;
}

/** The copy for a daily free-model limit when the feature has none of its own. */
const DAILY_LIMIT_MESSAGE =
  'OpenRouter has used up the daily allowance for this free model. Try again tomorrow, or choose a paid model in Settings.';

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
  limit: LimitContext = { daily: false },
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
  if (status === 400 && CONTEXT_LENGTH_PATTERN.test(detail)) {
    // Not retryable: the same input is too long again. The copy names the way out.
    return pipelineFailure('INPUT_TOO_LONG', TOO_LARGE_TO_READ, { retryable: false, detail });
  }
  if (status === 400 && REFUSED_SETTING_PATTERN.test(detail)) {
    // Not retryable: the same request is refused again. Retrying with another format is the
    // caller's decision (speech.ts does it for PCM-only models).
    return AUDIO_FORMAT_PATTERN.test(detail)
      ? pipelineFailure('MODEL_UNAVAILABLE', "This voice model can't produce that audio format.", {
          retryable: false,
          detail,
        })
      : pipelineFailure(
          'MODEL_UNAVAILABLE',
          "This model doesn't accept one of the settings the app sent. Choose another model or voice in Settings.",
          { retryable: false, detail },
        );
  }
  if (status === 408) {
    return pipelineFailure('NETWORK', 'OpenRouter took too long to answer. Try again.', {
      retryable: true,
      detail,
    });
  }
  if (status === 429 && limit.daily) {
    // A daily allowance does not refill on a retry, so the request is not repeated.
    return pipelineFailure('RATE_LIMITED', limit.dailyMessage ?? DAILY_LIMIT_MESSAGE, {
      retryable: false,
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
