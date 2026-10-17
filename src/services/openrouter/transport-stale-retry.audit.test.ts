/*
 * QA-F proof (P1, money). A paid request whose response has already arrived is retired when the
 * connection calls retireInFlight (a stall, or a heartbeat gap that means JS was frozen) while its
 * body is still being read. The transport treats the retirement as a stale connection and sends the
 * same request again, so OpenRouter bills the completion twice. Expected after the fix: one request.
 * This test fails until a response that has arrived is never re-sent.
 */
import { createTransport } from './transport';
import { createConnection } from '../network/connection';


describe('QA-F audit: retired attempt with a response in hand', () => {
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
    const request = transport.request(
      { method: 'POST', path: '/chat/completions', body: {}, accept: 'application/json' },
      async () => {
        reads += 1;
        if (reads === 1) {
          // The first response is in hand and its body is still being read when the retirement lands.
          markBodyStarted();
          await new Promise<never>(() => undefined);
        }
        return 'ok';
      },
    );

    await bodyStarted;
    connection.retireInFlight();

    await expect(request).resolves.toBe('ok');
    expect(sent).toBe(1);
  });
});
