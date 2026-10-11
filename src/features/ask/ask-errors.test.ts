import { PipelineFailure } from '@/services/openrouter/errors';

import { askErrorCopy } from './ask-errors';

function failure(code: Parameters<typeof askErrorCopy>[0] extends never ? never : string) {
  return new PipelineFailure({
    code: code as 'AUTH',
    message: 'raw provider text',
    retryable: false,
  });
}

describe('askErrorCopy', () => {
  it.each([
    ['AUTH', 'settings', 'Open Settings'],
    ['MODEL_UNAVAILABLE', 'settings', 'Open Settings'],
    ['INSUFFICIENT_CREDITS', 'retry', 'Try again'],
    ['NETWORK', 'retry', 'Try again'],
    ['RATE_LIMITED', 'retry', 'Try again'],
  ] as const)('maps %s to a %s action', (code, action, actionLabel) => {
    const copy = askErrorCopy(failure(code));

    expect(copy.action).toBe(action);
    expect(copy.actionLabel).toBe(actionLabel);
    expect(copy.title.length).toBeGreaterThan(0);
  });

  it('never shows the raw provider message for a known code', () => {
    expect(askErrorCopy(failure('NETWORK')).message).not.toContain('raw provider text');
  });

  it('falls back to a retry for anything unexpected', () => {
    expect(askErrorCopy(new Error('boom'))).toEqual({
      title: "Couldn't get an answer",
      message: 'Something went wrong while answering. Try again.',
      action: 'retry',
      actionLabel: 'Try again',
    });
  });
});
