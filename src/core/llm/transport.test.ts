import { addUsage, LlmCancelledError, throwIfCancelled, ZERO_USAGE } from './transport';

describe('addUsage', () => {
  it('sums tokens and cost', () => {
    expect(
      addUsage(
        { promptTokens: 10, completionTokens: 4, costUsd: 0.25 },
        { promptTokens: 5, completionTokens: 1, costUsd: 0.5 },
      ),
    ).toEqual({ promptTokens: 15, completionTokens: 5, costUsd: 0.75 });
  });

  it('keeps the cost unknown when either side is unknown, but still sums the tokens', () => {
    expect(
      addUsage(
        { promptTokens: 10, completionTokens: 4, costUsd: null },
        { promptTokens: 5, completionTokens: 1, costUsd: 0.5 },
      ),
    ).toEqual({ promptTokens: 15, completionTokens: 5, costUsd: null });
  });

  it('treats the zero usage as the identity', () => {
    const usage = { promptTokens: 3, completionTokens: 2, costUsd: 0.01 };
    expect(addUsage(ZERO_USAGE, usage)).toEqual(usage);
  });
});

describe('throwIfCancelled', () => {
  it('does nothing without a signal or with a live one', () => {
    expect(() => throwIfCancelled(undefined)).not.toThrow();
    expect(() => throwIfCancelled(new AbortController().signal)).not.toThrow();
  });

  it('throws a CANCELLED error once the signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const error = (() => {
      try {
        throwIfCancelled(controller.signal);
      } catch (e: unknown) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(LlmCancelledError);
    expect((error as LlmCancelledError).code).toBe('CANCELLED');
  });
});
