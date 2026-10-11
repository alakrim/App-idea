import { StageFailure } from '@/core/pipeline/errors';

import { WebViewRenderQueue } from './webview-queue';
import { IDLE_MS, MAX_WAIT_MS, RENDER_SCRIPT } from './webview-script';

function controller(): AbortController {
  return new AbortController();
}

describe('WebViewRenderQueue', () => {
  it('renders one page at a time, in request order', async () => {
    const queue = new WebViewRenderQueue(1000);
    const first = queue.render('https://a.example/1', controller().signal);
    const second = queue.render('https://a.example/2', controller().signal);

    expect(queue.current()).toEqual({ id: 1, url: 'https://a.example/1' });
    queue.complete(1, '<html>one</html>');
    await expect(first).resolves.toBe('<html>one</html>');

    expect(queue.current()).toEqual({ id: 2, url: 'https://a.example/2' });
    queue.complete(2, '<html>two</html>');
    await expect(second).resolves.toBe('<html>two</html>');
    expect(queue.current()).toBeNull();
  });

  it('ignores a report for a request that is not the active one', async () => {
    const queue = new WebViewRenderQueue(1000);
    const pending = queue.render('https://a.example/1', controller().signal);
    queue.complete(99, 'stale');
    expect(queue.current()?.id).toBe(1);
    queue.complete(1, 'fresh');
    await expect(pending).resolves.toBe('fresh');
  });

  it('cancels a queued request without disturbing the active one', async () => {
    const queue = new WebViewRenderQueue(1000);
    const active = queue.render('https://a.example/1', controller().signal);
    const waiting = controller();
    const queued = queue.render('https://a.example/2', waiting.signal);

    waiting.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(queue.current()?.id).toBe(1);
    queue.complete(1, 'done');
    await expect(active).resolves.toBe('done');
  });

  it('cancels the active request and starts the next one', async () => {
    const queue = new WebViewRenderQueue(1000);
    const running = controller();
    const active = queue.render('https://a.example/1', running.signal);
    const next = queue.render('https://a.example/2', controller().signal);

    running.abort();
    await expect(active).rejects.toMatchObject({ name: 'AbortError' });
    expect(queue.current()?.id).toBe(2);
    queue.complete(2, 'next');
    await expect(next).resolves.toBe('next');
  });

  it('fails a request the host reports as unrenderable, as a non-retryable pipeline error', async () => {
    const queue = new WebViewRenderQueue(1000);
    const pending = queue.render('https://a.example/1', controller().signal);
    queue.fail(1, 'load');
    const error = await pending.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(StageFailure);
    expect((error as StageFailure).error).toMatchObject({ code: 'UNKNOWN', retryable: false });
  });

  it('fails a request that the host never answers, after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const queue = new WebViewRenderQueue(500);
      const pending = queue.render('https://a.example/1', controller().signal);
      const settled = pending.catch((thrown: unknown) => thrown);
      jest.advanceTimersByTime(500);
      const error = await settled;
      expect((error as StageFailure).error.detail).toBe('webview_timeout');
      expect(queue.current()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects at once when the signal is already aborted', async () => {
    const queue = new WebViewRenderQueue(1000);
    const aborted = controller();
    aborted.abort();
    await expect(queue.render('https://a.example/1', aborted.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(queue.current()).toBeNull();
  });

  it('tells subscribers when the active request changes', async () => {
    const queue = new WebViewRenderQueue(1000);
    let calls = 0;
    const unsubscribe = queue.subscribe(() => {
      calls += 1;
    });
    const pending = queue.render('https://a.example/1', controller().signal);
    queue.complete(1, 'x');
    await pending;
    unsubscribe();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe('RENDER_SCRIPT', () => {
  it('posts only the document HTML back, after the idle wait and within the 12 s cap', () => {
    expect(RENDER_SCRIPT).toContain(
      'window.ReactNativeWebView.postMessage(document.documentElement.outerHTML)',
    );
    expect(RENDER_SCRIPT).toContain(`setTimeout(send, ${MAX_WAIT_MS})`);
    expect(RENDER_SCRIPT).toContain(`setTimeout(send, ${IDLE_MS})`);
    expect(RENDER_SCRIPT).not.toMatch(/eval\(|innerHTML\s*=/u);
  });
});
