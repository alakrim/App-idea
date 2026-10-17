import { createConnection } from '../network/connection';
import {
  chatReply,
  createFakeFetch,
  errorResponse,
  hangUntilAborted,
} from './__fixtures__/fake-fetch';
import { createOpenRouterClient } from './client';
import { PipelineFailure } from './errors';

import type { Route } from './__fixtures__/fake-fetch';

const FAKE_KEY = 'sk-or-v1-FAKEKEY0123456789abcdefghijklmnop';

/** A client on a connection the test drives, with its sleeps recorded. */
function setup(route: Route, maxRetries = 0) {
  const connection = createConnection();
  const fake = createFakeFetch(route);
  const sleeps: number[] = [];
  const client = createOpenRouterClient({
    getApiKey: async () => FAKE_KEY,
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: fake.fetchImpl,
    connection,
    maxRetries,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  });
  return { client, connection, calls: fake.calls, sleeps };
}

/** Lets the request reach the network before the test acts on it. */
async function untilCalls(calls: readonly unknown[], count: number): Promise<void> {
  for (let i = 0; i < 100 && calls.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('a request retired by a return to the foreground', () => {
  it('is retried at once, without spending a retry or waiting out a backoff', async () => {
    let attempts = 0;
    const { client, connection, calls, sleeps } = setup((call) => {
      attempts += 1;
      return attempts === 1 ? hangUntilAborted(call) : chatReply('hello');
    });
    const pending = client.chatText({ model: 'm', user: 'hi' });
    await untilCalls(calls, 1);

    connection.setAppState('background');
    connection.setAppState('active');

    await expect(pending).resolves.toMatchObject({ text: 'hello' });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([]);
  });

  it('is sent again with the same body and key', async () => {
    let attempts = 0;
    const { client, connection, calls } = setup((call) => {
      attempts += 1;
      return attempts === 1 ? hangUntilAborted(call) : chatReply('hello');
    });
    const pending = client.chatText({ model: 'm', user: 'same question' });
    await untilCalls(calls, 1);

    connection.setAppState('background');
    connection.setAppState('active');
    await pending;

    expect(calls[1]?.body).toEqual(calls[0]?.body);
    expect(calls[1]?.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
  });

  it('is not reported as cancelled, and a caller cancellation still wins over the retirement', async () => {
    const { client, connection, calls } = setup(hangUntilAborted);
    const controller = new AbortController();
    const pending = client.chatText({ model: 'm', user: 'hi', signal: controller.signal }).then(
      () => null,
      (error: unknown) => error,
    );
    await untilCalls(calls, 1);

    connection.setAppState('background');
    connection.setAppState('active');
    controller.abort();

    const failure = await pending;
    expect(failure).toBeInstanceOf(PipelineFailure);
    expect((failure as PipelineFailure).error.code).toBe('CANCELLED');
    expect(calls).toHaveLength(1);
  });

  it('is retired even when the fetch ignores its abort signal, as native fetch on a dead socket can', async () => {
    let attempts = 0;
    const { client, connection, calls } = setup(() => {
      attempts += 1;
      return attempts === 1 ? new Promise<Response>(() => undefined) : chatReply('hello');
    });
    const pending = client.chatText({ model: 'm', user: 'hi' });
    await untilCalls(calls, 1);

    connection.setAppState('background');
    connection.setAppState('active');

    await expect(pending).resolves.toMatchObject({ text: 'hello' });
  });

  it('is retired by a stall, through retireInFlight, and retried at once', async () => {
    let attempts = 0;
    const { client, connection, calls, sleeps } = setup((call) => {
      attempts += 1;
      return attempts === 1 ? hangUntilAborted(call) : chatReply('hello');
    });
    const pending = client.chatText({ model: 'm', user: 'hi' });
    await untilCalls(calls, 1);

    expect(connection.retireInFlight()).toBe(1);

    await expect(pending).resolves.toMatchObject({ text: 'hello' });
    expect(sleeps).toEqual([]);
  });

  it('stops re-sending after two stale retries, so a connection that keeps going stale ends', async () => {
    const { client, connection, calls } = setup(hangUntilAborted);
    const pending = client.chatText({ model: 'm', user: 'hi' }).then(
      () => null,
      (error: unknown) => error,
    );
    for (let retirement = 1; retirement <= 3; retirement += 1) {
      await untilCalls(calls, retirement);
      connection.retireInFlight();
    }

    const failure = (await pending) as PipelineFailure;
    expect(failure.error.code).toBe('NETWORK');
    expect(calls).toHaveLength(3);
  });

  it('still spends the retry budget on a real server failure after a retirement', async () => {
    let attempts = 0;
    const { client, connection, calls } = setup((call) => {
      attempts += 1;
      if (attempts === 1) return hangUntilAborted(call);
      return errorResponse(500, 'down');
    }, 1);
    const pending = client.chatText({ model: 'm', user: 'hi' }).then(
      () => null,
      (error: unknown) => error,
    );
    await untilCalls(calls, 1);

    connection.setAppState('background');
    connection.setAppState('active');

    const failure = (await pending) as PipelineFailure;
    expect(failure.error.code).toBe('UNKNOWN');
    // The stale retry is free, so the one retry the budget allows is still there for the 500.
    expect(calls).toHaveLength(3);
  });
});

describe('a request begun after the app went to the background', () => {
  it('is not retired when the app returns', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client, connection, calls } = setup(() => gate.then(() => chatReply('hello')));

    connection.setAppState('background');
    const pending = client.chatText({ model: 'm', user: 'hi' });
    await untilCalls(calls, 1);
    connection.setAppState('active');
    release();

    await expect(pending).resolves.toMatchObject({ text: 'hello' });
    expect(calls).toHaveLength(1);
  });

  it('keeps the ordinary failure path for a request the server rejects', async () => {
    const { client, connection, calls } = setup(() => errorResponse(401, 'bad key'));
    connection.setAppState('background');
    connection.setAppState('active');

    await expect(client.chatText({ model: 'm', user: 'hi' })).rejects.toMatchObject({
      error: { code: 'AUTH' },
    });
    expect(calls).toHaveLength(1);
  });
});
