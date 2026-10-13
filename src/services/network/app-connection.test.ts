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
});
