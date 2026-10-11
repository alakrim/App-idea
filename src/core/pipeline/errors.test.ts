import { isCancellation, StageFailure, toPipelineError } from './errors';

describe('toPipelineError', () => {
  it('uses the error a failure carries, when it is a valid PipelineError', () => {
    const carried = Object.assign(new Error('No connection'), {
      error: { code: 'NETWORK', message: 'No connection to OpenRouter.', retryable: true },
    });
    expect(toPipelineError(carried)).toEqual({
      code: 'NETWORK',
      message: 'No connection to OpenRouter.',
      retryable: true,
    });
  });

  it('keeps the code and detail of a StageFailure', () => {
    const failure = new StageFailure('CONTENT_EMPTY', 'Scan.', {
      retryable: false,
      detail: 'scanned_pdf',
    });
    expect(toPipelineError(failure)).toEqual({
      code: 'CONTENT_EMPTY',
      message: 'Scan.',
      retryable: false,
      detail: 'scanned_pdf',
    });
  });

  it('maps a typed output error to a retryable LLM_INVALID_OUTPUT with user copy', () => {
    const output = Object.assign(new Error('analysis reply invalid after repair: root: nope'), {
      code: 'LLM_INVALID_OUTPUT',
    });
    const mapped = toPipelineError(output);
    expect(mapped.code).toBe('LLM_INVALID_OUTPUT');
    expect(mapped.retryable).toBe(true);
    expect(mapped.message).not.toContain('nope');
  });

  it('maps anything else to a non-retryable UNKNOWN, with no internal detail in the message', () => {
    expect(toPipelineError(new Error('database is locked'))).toEqual({
      code: 'UNKNOWN',
      message: 'Something went wrong. Try again.',
      retryable: false,
    });
    expect(toPipelineError('a string')).toMatchObject({ code: 'UNKNOWN' });
  });

  it('recognises cancellation from a signal abort or a CANCELLED code', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(isCancellation(abort)).toBe(true);
    expect(toPipelineError(Object.assign(new Error('x'), { code: 'CANCELLED' })).code).toBe(
      'CANCELLED',
    );
    expect(isCancellation(new Error('network down'))).toBe(false);
  });
});
