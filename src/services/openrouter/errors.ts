import type { ErrorCode, PipelineError } from '@/core/domain';

/** Thrown by every service call. Carries the PipelineError plus transient retry hints. */
export class PipelineFailure extends Error {
  readonly error: PipelineError;
  /** Server-requested wait (from `retry-after`), in milliseconds, or null. Not part of the contract. */
  readonly retryAfterMs: number | null;
  /**
   * The attempt was retired because the connection went stale. It is retried at once and does not
   * count against the retry budget. Not part of the contract.
   */
  readonly stale: boolean;

  constructor(error: PipelineError, retryAfterMs: number | null = null, stale = false) {
    super(error.message);
    this.name = 'PipelineFailure';
    this.error = error;
    this.retryAfterMs = retryAfterMs;
    this.stale = stale;
  }
}

interface FailureOptions {
  retryable: boolean;
  detail?: string;
  retryAfterMs?: number | null;
  stale?: boolean;
}

export function pipelineFailure(
  code: ErrorCode,
  message: string,
  options: FailureOptions,
): PipelineFailure {
  const error: PipelineError = { code, message, retryable: options.retryable };
  if (options.detail !== undefined) error.detail = options.detail;
  return new PipelineFailure(error, options.retryAfterMs ?? null, options.stale ?? false);
}

const OPENROUTER_KEY_PATTERN = /sk-or-[A-Za-z0-9_-]+/g;

/** Removes the user's key, and anything shaped like one, from free text. */
export function redactSecrets(text: string, secret: string | null): string {
  const scrubbed = text.replace(OPENROUTER_KEY_PATTERN, '[redacted]');
  return secret ? scrubbed.split(secret).join('[redacted]') : scrubbed;
}

export function redactFailure(failure: PipelineFailure, secret: string | null): PipelineFailure {
  const { detail } = failure.error;
  if (detail === undefined) return failure;
  const error: PipelineError = { ...failure.error, detail: redactSecrets(detail, secret) };
  return new PipelineFailure(error, failure.retryAfterMs, failure.stale);
}
