/*
 * Render requests for the hidden WebView. One page renders at a time, in request order. Each
 * request can be cancelled, and it fails on its own after a timeout, so a host that never shows up
 * cannot stall the pipeline. The React host (webview-host.tsx) renders the current request and
 * reports back through `complete` or `fail`.
 */
import { StageFailure } from '@/core/pipeline/errors';

/** The host waits at most 12 s for the page, and this leaves room for its own load. */
export const WEBVIEW_RENDER_TIMEOUT_MS = 15_000;

/** The request the host should render now. The object is stable for the request's lifetime. */
export interface ActiveRender {
  readonly id: number;
  readonly url: string;
}

interface RenderJob {
  readonly id: number;
  readonly url: string;
  readonly resolve: (html: string) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
}

function abortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

export class WebViewRenderQueue {
  private nextId = 1;
  private queued: RenderJob[] = [];
  private active: {
    job: RenderJob;
    view: ActiveRender;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly timeoutMs: number = WEBVIEW_RENDER_TIMEOUT_MS) {}

  /** Renders the page in the host and resolves with its HTML. Rejects when cancelled or failed. */
  render(url: string, signal: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const job: RenderJob = {
        id: this.nextId,
        url,
        resolve,
        reject,
        signal,
        onAbort: () => this.cancel(job),
      };
      this.nextId += 1;
      signal.addEventListener('abort', job.onAbort, { once: true });
      this.queued.push(job);
      this.pump();
    });
  }

  /** The request the host renders now, or null when the host should show nothing. */
  current(): ActiveRender | null {
    return this.active?.view ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The host reports the rendered HTML of request `id`. Stale reports are ignored. */
  complete(id: number, html: string): void {
    if (this.active?.job.id !== id) return;
    const { job } = this.settle();
    job.resolve(html);
  }

  /** The host reports that request `id` could not be rendered. */
  fail(id: number, detail: string): void {
    if (this.active?.job.id !== id) return;
    const { job } = this.settle();
    job.reject(renderFailure(detail));
  }

  private cancel(job: RenderJob): void {
    job.signal.removeEventListener('abort', job.onAbort);
    if (this.active?.job === job) {
      const { job: running } = this.settle();
      running.reject(abortError());
      return;
    }
    this.queued = this.queued.filter((entry) => entry !== job);
    job.reject(abortError());
    this.notify();
  }

  /** Clears the active request and starts the next one. Returns the request that was active. */
  private settle(): { job: RenderJob } {
    if (!this.active) throw new Error('No render is active.');
    const { job, timer } = this.active;
    clearTimeout(timer);
    job.signal.removeEventListener('abort', job.onAbort);
    this.active = null;
    this.notify();
    this.pump();
    return { job };
  }

  private pump(): void {
    if (this.active) return;
    const job = this.queued.shift();
    if (!job) return;
    const timer = setTimeout(() => this.fail(job.id, 'timeout'), this.timeoutMs);
    this.active = { job, view: { id: job.id, url: job.url }, timer };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function renderFailure(detail: string): StageFailure {
  return new StageFailure(
    'UNKNOWN',
    'We could not read this page in the browser. Paste the text instead.',
    { retryable: false, detail: `webview_${detail}` },
  );
}
