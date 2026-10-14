import { createForegroundStatus } from './foreground-status';

describe('createForegroundStatus', () => {
  it('starts stopped on a platform with a foreground service, and unsupported without one', () => {
    expect(createForegroundStatus(true).get()).toEqual({
      state: 'stopped',
      lastStartedAt: null,
      failure: null,
    });
    expect(createForegroundStatus(false).get().state).toBe('unsupported');
  });

  it('keeps the JS runtime alive only while the service is starting or running', () => {
    const store = createForegroundStatus(true);
    const set = (state: 'stopped' | 'starting' | 'running' | 'failed') =>
      store.set({ state, lastStartedAt: null, failure: null });

    set('starting');
    expect(store.keepsAlive()).toBe(true);
    set('running');
    expect(store.keepsAlive()).toBe(true);
    set('failed');
    expect(store.keepsAlive()).toBe(false);
    set('stopped');
    expect(store.keepsAlive()).toBe(false);
  });

  it('notifies subscribers of each change, and stops after unsubscribe', () => {
    const store = createForegroundStatus(true);
    const seen: string[] = [];
    const unsubscribe = store.subscribe((status) => seen.push(status.state));

    store.set({ state: 'starting', lastStartedAt: null, failure: null });
    unsubscribe();
    store.set({ state: 'running', lastStartedAt: 1, failure: null });

    expect(seen).toEqual(['starting']);
  });
});
