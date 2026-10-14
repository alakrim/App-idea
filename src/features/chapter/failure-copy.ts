import type { PipelineError } from '@/core/domain';

/** The copy when a chapter stopped and the pipeline gave no reason. */
export const STOPPED_COPY = 'Processing stopped. Try again.';

/**
 * What to change before a retry can work. Null when a plain retry is the answer. The pipeline's
 * own message already names the fix for a missing narrator, so that code needs no extra line.
 */
export function changeHint(failure: PipelineError): string | null {
  if (failure.retryable) return null;
  switch (failure.code) {
    case 'MODEL_UNAVAILABLE':
      return null;
    case 'AUTH':
      return 'Check your OpenRouter key in Settings, then try again.';
    case 'INSUFFICIENT_CREDITS':
      return 'Add credit to your OpenRouter account, then try again.';
    case 'INPUT_TOO_LONG':
      return 'Use a shorter source, then try again.';
    case 'CONTENT_EMPTY':
    case 'CONTENT_BLOCKED':
    case 'PARSE_FAILED':
      return 'Check the source, or use another one, then try again.';
    default:
      return 'If it keeps failing, delete this chapter and add it again.';
  }
}

/** One line that says what happened and, when a plain retry will not help, what to change. */
export function failureCopy(failure: PipelineError | null): string {
  if (failure === null) return STOPPED_COPY;
  const hint = changeHint(failure);
  return hint === null ? failure.message : `${failure.message} ${hint}`;
}
