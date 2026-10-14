import { ErrorCodeSchema, PipelineErrorSchema } from '../domain';

import type { ErrorCode, PipelineError } from '../domain';

/** A failure the pipeline raises itself, such as an empty page or a missing chapter. */
export class StageFailure extends Error {
  readonly error: PipelineError;

  constructor(code: ErrorCode, message: string, options: { retryable: boolean; detail?: string }) {
    super(message);
    this.name = 'StageFailure';
    this.error = {
      code,
      message,
      retryable: options.retryable,
      ...(options.detail === undefined ? {} : { detail: options.detail }),
    };
  }
}

const UNKNOWN_MESSAGE = 'Something went wrong. Try again.';

/** The copy for a full device. The retry works once some space has been freed. */
export const STORAGE_FULL_MESSAGE =
  'Your phone is out of storage. Free up some space, then tap Try again.';

/**
 * The messages a write raises when the device has no room: the OS error (ENOSPC), the SQLite error
 * for a full database, and the file system's own wording. Expo does not expose a code for this, so
 * the message is the signal.
 */
const STORAGE_FULL_PATTERN = /ENOSPC|no space left|SQLITE_FULL|database or disk is full/iu;

/** True when a thrown write failure means the device is out of storage. */
export function isStorageFull(thrown: unknown): boolean {
  const message = (thrown as { message?: unknown } | null)?.message;
  const code = (thrown as { code?: unknown } | null)?.code;
  const text = [message, code].filter((part): part is string => typeof part === 'string');
  return text.some((part) => STORAGE_FULL_PATTERN.test(part));
}

/** A typed out-of-storage failure. It is retryable, because freeing space is what fixes it. */
export function storageFullFailure(detail: string): StageFailure {
  return new StageFailure('STORAGE_FULL', STORAGE_FULL_MESSAGE, { retryable: true, detail });
}

/**
 * Maps any thrown value to a PipelineError. A value that already carries a valid `error` (such as
 * the OpenRouter client's PipelineFailure) is used as is. Typed output errors and cancellation are
 * recognised by their `code`. Everything else becomes UNKNOWN, which is not retryable.
 */
export function toPipelineError(thrown: unknown): PipelineError {
  if (thrown instanceof StageFailure) return thrown.error;
  const carried = PipelineErrorSchema.safeParse((thrown as { error?: unknown } | null)?.error);
  if (carried.success) return carried.data;

  const code = ErrorCodeSchema.safeParse((thrown as { code?: unknown } | null)?.code);
  if (code.success && code.data === 'CANCELLED') {
    return { code: 'CANCELLED', message: 'Cancelled.', retryable: false };
  }
  if (code.success && code.data === 'LLM_INVALID_OUTPUT') {
    return {
      code: 'LLM_INVALID_OUTPUT',
      message: 'The model sent a reply the app could not use. Try again.',
      retryable: true,
    };
  }
  if (isStorageFull(thrown)) {
    return { code: 'STORAGE_FULL', message: STORAGE_FULL_MESSAGE, retryable: true };
  }
  return { code: 'UNKNOWN', message: UNKNOWN_MESSAGE, retryable: false };
}

/** True when the failure is a cancellation, whether it came from a signal or from a model call. */
export function isCancellation(thrown: unknown): boolean {
  if ((thrown as { name?: unknown } | null)?.name === 'AbortError') return true;
  return toPipelineError(thrown).code === 'CANCELLED';
}
