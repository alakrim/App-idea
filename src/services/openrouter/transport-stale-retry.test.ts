/*
 * A paid request whose response has arrived is not retired. A retirement (a stall, or a heartbeat gap
 * that means JS was frozen) must not abort the body read and re-send the request, which would bill
 * the completion twice (QA-F F-01).
 */
import { createTransport } from './transport';
import { createConnection } from '../network/connection';


describe('a retirement after the response has arrived', () => {
  it('does not send a paid request again after its response has arrived', async () => {
    const connection = createConnection({ now: () => 0 });
    let sent = 0;
    let markBodyStarted: () => void = () => undefined;
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    const transport = createTransport({
      getApiKey: async () => 'test-key',
      fetchImpl: (async () => {
        sent += 1;
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
      baseUrl: 'https://openrouter.test/api/v1',
      appUrl: 'https://lectio.test',
      appTitle: 'Lectio',
      timeoutMs: 60_000,
      maxRetries: 3,
      sleep: async () => undefined,
      random: () => 0.5,
      now: () => 0,
      connection,
    });

    let reads = 0;
    let finishBody: () => void = () => undefined;
    const bodyDone = new Promise<void>((resolve) => {
      finishBody = resolve;
    });
    const request = transport.request(
      { method: 'POST', path: '/chat/completions', body: {}, accept: 'application/json' },
      async () => {
        reads += 1;
        // The first response is in hand and its body is still being read when the retirement lands.
        markBodyStarted();
        await bodyDone;
        return 'ok';
      },
    );

    await bodyStarted;
    expect(connection.retireInFlight()).toBe(0);
    finishBody();

    await expect(request).resolves.toBe('ok');
    expect(reads).toBe(1);
    expect(sent).toBe(1);
  });
});
