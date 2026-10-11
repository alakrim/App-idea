/**
 * Pipeline error contract, as defined in docs/specs/domain.md (Pipeline).
 * Defined locally until src/core/domain lands; the architect reconciles the two.
 */
export type ErrorCode =
  | 'NETWORK'
  | 'AUTH'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'CONTENT_EMPTY'
  | 'CONTENT_BLOCKED'
  | 'PARSE_FAILED'
  | 'LLM_INVALID_OUTPUT'
  | 'STORAGE_FULL'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface PipelineError {
  code: ErrorCode;
  /** User-facing, short and human. */
  message: string;
  detail?: string;
  retryable: boolean;
}

/** Thrown by every service call. Carries the PipelineError plus transient retry hints. */
export class PipelineFailure extends Error {
  readonly error: PipelineError;
  /** Server-requested wait (from `retry-after`), in milliseconds, or null. Not part of the contract. */
  readonly retryAfterMs: number | null;

  constructor(error: PipelineError, retryAfterMs: number | null = null) {
    super(error.message);
    this.name = 'PipelineFailure';
    this.error = error;
    this.retryAfterMs = retryAfterMs;
  }
}

interface FailureOptions {
  retryable: boolean;
  detail?: string;
  retryAfterMs?: number | null;
}

export function pipelineFailure(
  code: ErrorCode,
  message: string,
  options: FailureOptions,
): PipelineFailure {
  const error: PipelineError = { code, message, retryable: options.retryable };
  if (options.detail !== undefined) error.detail = options.detail;
  return new PipelineFailure(error, options.retryAfterMs ?? null);
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
  return new PipelineFailure(error, failure.retryAfterMs);
}
