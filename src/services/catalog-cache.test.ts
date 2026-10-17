import { persistCatalog, type CatalogStore } from './catalog-cache';

import type { ModelCatalog } from './openrouter/models';

const EMPTY = '{"version":1,"entries":[]}';
const SAVED = '{"version":1,"entries":[{"outputModality":"text","fetchedAt":1,"models":[]}]}';
const FETCHED = '{"version":1,"entries":[{"outputModality":"text","fetchedAt":2,"models":[]}]}';

/**
 * A catalogue whose `list` either answers from its payload (a cache hit) or fetches `fetchWith` and
 * stores it, or fails. The test sets the next answer, so no request is made.
 */
function fakeCatalog(initial: string = EMPTY) {
  const state = {
    payload: initial,
    fetchWith: null as string | null,
    failFetch: false,
  };
  const models: ModelCatalog = {
    list: jest.fn(async () => {
      if (state.fetchWith === null) return [];
      if (state.failFetch) throw new Error('offline');
      state.payload = state.fetchWith;
      return [];
    }),
    serialize: () => state.payload,
    hydrate: (payload) => {
      state.payload = payload;
      return true;
    },
  };
  return { models, state };
}

function fakeStore(saved: string | null = null) {
  const store: CatalogStore = {
    read: jest.fn(() => saved),
    write: jest.fn(),
  };
  return store;
}

describe('persistCatalog', () => {
  it('restores the saved catalogue on the first list, not when it is built', async () => {
    const { models, state } = fakeCatalog();
    const store = fakeStore(SAVED);

    const wrapped = persistCatalog(models, store);
    expect(store.read).not.toHaveBeenCalled();

    await wrapped.list();
    expect(store.read).toHaveBeenCalledTimes(1);
    expect(state.payload).toBe(SAVED);
  });

  it('writes the catalogue after a fetch that changed it', async () => {
    const { models, state } = fakeCatalog();
    const store = fakeStore(SAVED);
    const wrapped = persistCatalog(models, store);
    state.fetchWith = FETCHED;

    await wrapped.list({ fresh: true });

    expect(store.write).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledWith(FETCHED);
  });

  it('writes nothing on a cache hit, so only a fetch rewrites the file', async () => {
    const { models } = fakeCatalog();
    const store = fakeStore(SAVED);
    const wrapped = persistCatalog(models, store);

    await wrapped.list();
    await wrapped.list();

    expect(store.write).not.toHaveBeenCalled();
  });

  it('writes nothing when the fetch fails, and the failure reaches the caller', async () => {
    const { models, state } = fakeCatalog();
    const store = fakeStore(SAVED);
    const wrapped = persistCatalog(models, store);
    state.fetchWith = FETCHED;
    state.failFetch = true;

    await expect(wrapped.list({ fresh: true })).rejects.toThrow('offline');
    expect(store.write).not.toHaveBeenCalled();
  });

  it('starts from an empty catalogue when nothing was saved, and still writes the first fetch', async () => {
    const { models, state } = fakeCatalog();
    const store = fakeStore(null);
    const wrapped = persistCatalog(models, store);
    state.fetchWith = FETCHED;

    await wrapped.list();

    expect(store.write).toHaveBeenCalledWith(FETCHED);
  });

  it('passes serialize and hydrate through to the catalogue', () => {
    const { models } = fakeCatalog();
    const wrapped = persistCatalog(models, fakeStore(null));

    expect(wrapped.hydrate(SAVED)).toBe(true);
    expect(wrapped.serialize()).toBe(SAVED);
  });
});
