import type { ErrorCode, PipelineError } from '@/core/domain';

import { changeHint, failureCopy, STOPPED_COPY } from './failure-copy';

function failure(code: ErrorCode, retryable: boolean, message = 'It failed.'): PipelineError {
  return { code, message, retryable };
}

describe('retry policy: retryable failures', () => {
  it('needs no change, only a retry', () => {
    expect(changeHint(failure('NETWORK', true))).toBeNull();
    expect(failureCopy(failure('NETWORK', true, 'Connection dropped.'))).toBe(
      'Connection dropped.',
    );
  });
});

describe('retry policy: non-retryable failures say what to change', () => {
  it.each([
    ['AUTH', 'Check your OpenRouter key in Settings, then try again.'],
    ['INSUFFICIENT_CREDITS', 'Add credit to your OpenRouter account, then try again.'],
    ['INPUT_TOO_LONG', 'Use a shorter source, then try again.'],
    ['STORAGE_FULL', 'Free up space on this phone, then try again.'],
    ['CONTENT_EMPTY', 'Check the source, or use another one, then try again.'],
    ['CONTENT_BLOCKED', 'Check the source, or use another one, then try again.'],
    ['PARSE_FAILED', 'Check the source, or use another one, then try again.'],
    ['UNKNOWN', 'If it keeps failing, delete this chapter and add it again.'],
  ] as const)('%s gives a concrete next step', (code, hint) => {
    expect(changeHint(failure(code, false))).toBe(hint);
    expect(failureCopy(failure(code, false, 'Something went wrong.'))).toBe(
      `Something went wrong. ${hint}`,
    );
  });

  it('keeps the pipeline wording for a missing narrator, which already names the fix', () => {
    const narrator = failure(
      'MODEL_UNAVAILABLE',
      false,
      "The Best quality narrator can't read Japanese. Choose Free in Settings, then retry.",
    );
    expect(changeHint(narrator)).toBeNull();
    expect(failureCopy(narrator)).toBe(narrator.message);
  });
});

describe('failureCopy without a recorded error', () => {
  it('falls back to the generic stopped copy', () => {
    expect(failureCopy(null)).toBe(STOPPED_COPY);
  });
});
