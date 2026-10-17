/*
 * Abort helpers for the parallel parts of a run. They reject with the same error that the model
 * calls raise on cancellation, so the runner classifies every abort in one place.
 */
import { LlmCancelledError } from '../llm/transport';

/** Resolves like `promise`, or rejects as soon as `signal` aborts, whichever comes first. */
export function untilSettled<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new LlmCancelledError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new LlmCancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Waits `ms`, or rejects as soon as `signal` aborts. */
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new LlmCancelledError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new LlmCancelledError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
