import type { NetworkEvent } from '@/core/pipeline/ports';

import { createConnection } from './connection';

/** Records the events a connection emits, in order. */
function listen(connection: ReturnType<typeof createConnection>): NetworkEvent[] {
  const events: NetworkEvent[] = [];
  connection.subscribe((event) => events.push(event));
  return events;
}

/** An attempt that records when it was retired. */
function attempt(connection: ReturnType<typeof createConnection>, timeoutMs = 120_000) {
  const retired = { count: 0 };
  const unregister = connection.register({
    timeoutMs,
    retire: () => {
      retired.count += 1;
    },
  });
  return { retired, unregister };
}

describe('connection epochs', () => {
  it('retires a request begun before the app left the foreground, once it returns', () => {
    const connection = createConnection();
    const before = attempt(connection);

    connection.setAppState('background');
    expect(before.retired.count).toBe(0);
    connection.setAppState('active');

    expect(before.retired.count).toBe(1);
  });

  it('leaves a request begun after the app went to the background alone', () => {
    const connection = createConnection();
    connection.setAppState('background');
    const during = attempt(connection);

    connection.setAppState('active');

    expect(during.retired.count).toBe(0);
  });

  it('retires a request again only if it is still in flight', () => {
    const connection = createConnection();
    const finished = attempt(connection);
    finished.unregister();

    connection.setAppState('background');
    connection.setAppState('active');

    expect(finished.retired.count).toBe(0);
  });

  it('treats inactive as away from the foreground, and ignores a repeated state', () => {
    const connection = createConnection();
    const events = listen(connection);
    const request = attempt(connection);

    connection.setAppState('inactive');
    connection.setAppState('background');
    connection.setAppState('background');
    connection.setAppState('active');
    connection.setAppState('active');

    expect(request.retired.count).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['attempt', 'backgrounded', 'staleAbort', 'resumed']);
  });
});

describe('retireInFlight', () => {
  it('retires every request in flight, and reports how many', () => {
    const connection = createConnection();
    const first = attempt(connection);
    const second = attempt(connection);

    expect(connection.retireInFlight()).toBe(2);
    expect(first.retired.count).toBe(1);
    expect(second.retired.count).toBe(1);
    expect(connection.retireInFlight()).toBe(0);
  });
});

describe('events', () => {
  it('reports each attempt with its timeout, and each retirement', () => {
    const connection = createConnection();
    const events = listen(connection);

    attempt(connection, 180_000);
    connection.retireInFlight();

    expect(events).toEqual([{ type: 'attempt', timeoutMs: 180_000 }, { type: 'staleAbort' }]);
  });

  it('stops reporting to a listener that unsubscribed', () => {
    const connection = createConnection();
    const events: NetworkEvent[] = [];
    const unsubscribe = connection.subscribe((event) => events.push(event));

    unsubscribe();
    attempt(connection);

    expect(events).toEqual([]);
  });
});

describe('connection heartbeat', () => {
  function clocked() {
    const clock = { t: 0 };
    const connection = createConnection({ now: () => clock.t, freezeGapMs: 10_000 });
    connection.heartbeat();
    return { clock, connection };
  }

  it('retires nothing after a short trip away while JS kept running', () => {
    const { clock, connection } = clocked();
    const request = attempt(connection);

    connection.setAppState('background');
    for (let i = 0; i < 60; i += 1) {
      clock.t += 1_000;
      connection.heartbeat();
    }
    connection.setAppState('active');

    expect(request.retired.count).toBe(0);
  });

  it('retires a request begun before a freeze, on return', () => {
    const { clock, connection } = clocked();
    const request = attempt(connection);

    connection.setAppState('background');
    clock.t += 60_000;
    connection.setAppState('active');

    expect(request.retired.count).toBe(1);
  });

  it('retires on the first beat after a freeze, even when that beat comes before the return', () => {
    const { clock, connection } = clocked();
    const request = attempt(connection);

    connection.setAppState('background');
    clock.t += 60_000;
    connection.heartbeat();
    expect(request.retired.count).toBe(1);
    connection.setAppState('active');

    expect(request.retired.count).toBe(1);
  });

  it('leaves a request begun after the freeze alone', () => {
    const { clock, connection } = clocked();
    clock.t += 60_000;
    connection.heartbeat();
    const after = attempt(connection);
    connection.setAppState('background');
    connection.setAppState('active');

    expect(after.retired.count).toBe(0);
  });
});
