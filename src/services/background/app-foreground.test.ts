import { AppState } from 'react-native';

import { createAppForeground } from './app-foreground';

describe('createAppForeground', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the current state, and reports each change as active or not', () => {
    const remove = jest.fn();
    const handlers: { onChange?: (state: string) => void } = {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      handlers.onChange = listener as (state: string) => void;
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    const app = createAppForeground();
    const seen: boolean[] = [];

    expect(app.isActive()).toBe(true);
    const unsubscribe = app.subscribe((active) => seen.push(active));
    handlers.onChange?.('background');
    handlers.onChange?.('active');
    unsubscribe();

    expect(seen).toEqual([false, true]);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
