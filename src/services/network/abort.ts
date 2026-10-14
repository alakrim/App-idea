/*
 * Settles with `work` unless `signal` aborts first. Native fetch and body reads on a dead socket can
 * ignore their abort signal, so an attempt that must end when the connection goes stale cannot wait
 * for them. The losing promise is still handled, so it never raises an unhandled rejection.
 */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      work.catch(() => undefined);
      return;
    }
    const onAbort = (): void => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

export function abortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}
