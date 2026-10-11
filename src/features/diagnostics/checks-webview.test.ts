import { bridgeHtml, checkBridgeSize, checkRenderRoundTrip, ROUND_TRIP_URL } from './checks-webview';

describe('render round trip probe', () => {
  it('loads the example page and reports the time and the size of its HTML', async () => {
    const render = jest.fn(async () => '<html>Example</html>');

    const outcome = await checkRenderRoundTrip({ render });

    expect(render).toHaveBeenCalledWith(ROUND_TRIP_URL, expect.any(AbortSignal));
    expect(outcome).toMatchObject({
      status: 'pass',
      values: { url: 'https://example.com', htmlLength: 20 },
    });
    expect(typeof outcome.values.durationMs).toBe('number');
  });

  it('fails on an empty page', async () => {
    expect(await checkRenderRoundTrip({ render: async () => '' })).toMatchObject({
      status: 'fail',
      message: 'The page came back empty.',
    });
  });

  it('lets a render error through, so the runner reports it as an error', async () => {
    await expect(
      checkRenderRoundTrip({ render: () => Promise.reject(new Error('host not mounted')) }),
    ).rejects.toThrow('host not mounted');
  });
});

describe('bridge size probe', () => {
  it('passes when native receives every character that was posted', async () => {
    const outcome = await checkBridgeSize({ send: async (bytes) => bytes }, 1_000_000);
    expect(outcome).toMatchObject({
      status: 'pass',
      values: { requestedChars: 1_000_000, receivedChars: 1_000_000 },
    });
  });

  it('fails and reports the short count when the bridge drops characters', async () => {
    const outcome = await checkBridgeSize({ send: async () => 4_096 }, 5_000_000);
    expect(outcome).toMatchObject({
      status: 'fail',
      values: { requestedChars: 5_000_000, receivedChars: 4_096 },
      message: 'Sent 5000000 characters, received 4096.',
    });
  });

  it('builds a page that posts the requested number of characters', () => {
    expect(bridgeHtml(3)).toContain("postMessage('x'.repeat(3))");
  });
});
