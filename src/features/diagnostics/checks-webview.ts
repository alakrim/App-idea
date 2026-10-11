import type { ProbeOutcome } from './probe';

/** The page the render round trip loads. It must answer over plain https. */
export const ROUND_TRIP_URL = 'https://example.com';

/** Message sizes, in characters, that the bridge is asked to carry back to native. */
export const BRIDGE_SIZES = [
  { id: 'bridge-1mb', bytes: 1_000_000 },
  { id: 'bridge-5mb', bytes: 5_000_000 },
] as const;

/** The render queue the app's pipeline uses. The round trip goes through it, so the host must be mounted. */
export interface RenderDeps {
  render(url: string, signal: AbortSignal): Promise<string>;
}

/** Loads a page in the hidden WebView and reports the time and size of its HTML. */
export async function checkRenderRoundTrip(deps: RenderDeps): Promise<ProbeOutcome> {
  const startedAt = Date.now();
  const html = await deps.render(ROUND_TRIP_URL, new AbortController().signal);
  const durationMs = Date.now() - startedAt;
  const passed = html.length > 0;
  return {
    status: passed ? 'pass' : 'fail',
    values: { url: ROUND_TRIP_URL, durationMs, htmlLength: html.length },
    message: passed ? undefined : 'The page came back empty.',
  };
}

/** Posts a string of `bytes` characters from the page to native and reports what arrived. */
export interface BridgeDeps {
  send(bytes: number): Promise<number>;
}

export async function checkBridgeSize(deps: BridgeDeps, bytes: number): Promise<ProbeOutcome> {
  const startedAt = Date.now();
  const received = await deps.send(bytes);
  const durationMs = Date.now() - startedAt;
  const passed = received === bytes;
  return {
    status: passed ? 'pass' : 'fail',
    values: { requestedChars: bytes, receivedChars: received, durationMs },
    message: passed ? undefined : `Sent ${bytes} characters, received ${received}.`,
  };
}
