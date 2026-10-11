import { installWebCryptoPolyfill } from './web-crypto-polyfill';

// Hoisted by Jest above the import.
jest.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
}));

describe('installWebCryptoPolyfill', () => {
  it('adds crypto.getRandomValues when the runtime has no crypto, as on Hermes', () => {
    const target: { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } } = {};
    const source = jest.fn((bytes: Uint8Array) => bytes.fill(9));

    expect(installWebCryptoPolyfill(target as never, source as never)).toBe(true);
    expect(target.crypto?.getRandomValues?.(new Uint8Array(2))).toEqual(new Uint8Array([9, 9]));
  });

  it('never replaces an existing implementation', () => {
    const existing = jest.fn((bytes: Uint8Array) => bytes);
    const target = { crypto: { getRandomValues: existing } };

    expect(installWebCryptoPolyfill(target as never, jest.fn() as never)).toBe(false);
    expect(target.crypto.getRandomValues).toBe(existing);
  });

  it('fills in getRandomValues on a crypto object that lacks it', () => {
    const target: { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } } = { crypto: {} };

    expect(installWebCryptoPolyfill(target as never, ((b: Uint8Array) => b) as never)).toBe(true);
    expect(typeof target.crypto?.getRandomValues).toBe('function');
  });
});
