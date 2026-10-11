import { monotonicFactory } from 'ulid';
import { z } from 'zod';

import type { PRNG } from 'ulid';

/** ULID: 26 Crockford base32 characters, lexicographically sortable by creation time. */
export const IdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Expected a ULID');
export type Id = z.infer<typeof IdSchema>;

/** Epoch milliseconds. Stored as INTEGER in SQLite. */
export const TimestampSchema = z.number().int().nonnegative();
export type Timestamp = z.infer<typeof TimestampSchema>;

export type IdGenerator = () => Id;

export interface IdGeneratorOptions {
  /** Injected randomness for tests. Defaults to crypto-backed randomness from the ulid package. */
  prng?: PRNG;
  /** Injected clock for tests, in epoch milliseconds. Defaults to Date.now(). */
  now?: () => number;
}

/** Creates a monotonic generator: IDs from one generator always sort in creation order. */
export function createIdGenerator(options: IdGeneratorOptions = {}): IdGenerator {
  const next = monotonicFactory(options.prng ?? defaultPrng());
  return () => next(options.now?.()) as Id;
}

/**
 * The randomness for the ID's random part. The ulid package throws when no Web Crypto is present,
 * and Hermes (the release JS engine on Android) has none, so that throw crashed the app at startup.
 * IDs are row keys, not secrets, so Math.random is an acceptable source where Web Crypto is absent.
 */
function defaultPrng(): PRNG {
  const source = (globalThis as { crypto?: { getRandomValues?: (bytes: Uint8Array) => Uint8Array } })
    .crypto;
  if (typeof source?.getRandomValues === 'function') {
    const getRandomValues = source.getRandomValues.bind(source);
    return () => {
      const [byte = 0] = getRandomValues(new Uint8Array(1));
      return byte / 256;
    };
  }
  return Math.random;
}

const defaultGenerator = createIdGenerator();

export function newId(): Id {
  return defaultGenerator();
}
