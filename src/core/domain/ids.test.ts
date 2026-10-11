import { dirname, join } from 'node:path';

import { createIdGenerator, newId } from './ids';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Metro resolves ulid's browser build on React Native, while Jest resolves the Node build, which
 * never touches the global `crypto`. This test loads the browser build explicitly.
 */
const ULID_BROWSER_BUILD = join(
  dirname(require.resolve('ulid/package.json')),
  'dist/browser/index.cjs',
);

/**
 * Hermes has no Web Crypto. These tests remove `crypto` from the global to reproduce the device,
 * where the browser build of ulid used to throw while the domain module loaded.
 */
describe('ids without Web Crypto (the Hermes runtime)', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, 'crypto', original);
    } else {
      Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it('loads the domain module with the browser build of ulid, as the app does at startup', () => {
    jest.isolateModules(() => {
      jest.doMock('ulid', () => jest.requireActual(ULID_BROWSER_BUILD));
      expect(() => {
        // require (not requireActual) so the module loads in the isolated registry, not the cached one.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./ids');
      }).not.toThrow();
    });
  });

  it('generates valid ULIDs that sort in creation order', () => {
    const now = 1_700_000_000_000;
    const next = createIdGenerator({ now: () => now });
    const ids = [next(), next(), next()];

    for (const id of ids) {
      expect(id).toMatch(ULID_PATTERN);
    }
    expect([...ids].sort()).toEqual(ids);
  });

  it('keeps the shared default generator working', () => {
    expect(newId()).toMatch(ULID_PATTERN);
  });
});
