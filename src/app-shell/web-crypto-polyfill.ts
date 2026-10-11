/**
 * Web Crypto `getRandomValues` for the Hermes runtime, backed by the platform's secure random
 * generator (expo-crypto). Hermes has no `globalThis.crypto`, and libraries such as ulid throw
 * when it is missing: that crashed the first release build on launch (brief X1).
 *
 * Loaded first by index.js, before any other module. It never replaces an existing implementation.
 */
import { getRandomValues } from 'expo-crypto';

type RandomValues = typeof getRandomValues;

interface CryptoLike {
  getRandomValues?: RandomValues;
}

/** Installs `crypto.getRandomValues` on the given global when it is missing. Returns whether it did. */
export function installWebCryptoPolyfill(
  target: { crypto?: CryptoLike } = globalThis as { crypto?: CryptoLike },
  source: RandomValues = getRandomValues,
): boolean {
  if (typeof target.crypto?.getRandomValues === 'function') return false;
  const crypto: CryptoLike = target.crypto ?? {};
  crypto.getRandomValues = source;
  if (!target.crypto) {
    Object.defineProperty(target, 'crypto', { value: crypto, configurable: true, writable: true });
  }
  return true;
}

installWebCryptoPolyfill();
