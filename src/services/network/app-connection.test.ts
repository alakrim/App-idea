import { getAppConnection } from './app-connection';

const mockListeners: ((state: string) => void)[] = [];

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_type: string, listener: (state: string) => void) => {
      mockListeners.push(listener);
      return { remove: () => undefined };
    },
  },
}));

beforeAll(() => {
  // The heartbeat is a 1 s interval; fake timers keep it from holding Jest open.
  jest.useFakeTimers();
});

afterAll(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('getAppConnection', () => {
  it('is one connection, subscribed once to the app state', () => {
    const first = getAppConnection();
    const second = getAppConnection();

    expect(second).toBe(first);
    expect(mockListeners).toHaveLength(1);
  });

  it('feeds app state changes into the connection', () => {
    const connection = getAppConnection();
    const events: string[] = [];
    connection.subscribe((event) => events.push(event.type));

    mockListeners[0]?.('background');
    mockListeners[0]?.('active');

    expect(events).toEqual(['backgrounded', 'resumed']);
  });

  it('runs a heartbeat, so a short trip away retires nothing', () => {
    const connection = getAppConnection();
    let retired = 0;
    const unregister = connection.register({ timeoutMs: 1_000, retire: () => (retired += 1) });

    mockListeners[0]?.('background');
    jest.advanceTimersByTime(30_000);
    mockListeners[0]?.('active');

    expect(retired).toBe(0);
    unregister();
  });
});
