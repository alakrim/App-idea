import { createForegroundStatus } from './foreground-status';

describe('createForegroundStatus', () => {
  it('starts stopped on a platform with a processing service, and unsupported without one', () => {
    expect(createForegroundStatus(true).get()).toBe('stopped');
    expect(createForegroundStatus(false).get()).toBe('unsupported');
  });

  it('keeps the JS runtime alive only while the service is starting or running', () => {
    const store = createForegroundStatus(true);

    store.set('starting');
    expect(store.keepsAlive()).toBe(true);
    store.set('running');
    expect(store.keepsAlive()).toBe(true);
    store.set('stopped');
    expect(store.keepsAlive()).toBe(false);
  });

  it('never keeps the runtime alive where there is no service', () => {
    const store = createForegroundStatus(false);
    expect(store.keepsAlive()).toBe(false);
  });

  it('notifies subscribers of each change, and stops after unsubscribe', () => {
    const store = createForegroundStatus(true);
    const seen: string[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state));

    store.set('starting');
    store.set('starting');
    unsubscribe();
    store.set('running');

    expect(seen).toEqual(['starting']);
    expect(store.get()).toBe('running');
  });
});
