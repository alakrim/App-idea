import * as SecureStore from 'expo-secure-store';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * The user's OpenRouter key (BYOK). It lives only in the OS keystore. Nothing in this module logs,
 * formats or returns the key except to its caller, so keep it that way.
 */

const KEY_NAME = 'openrouter.api-key';
/** AFTER_FIRST_UNLOCK lets the background pipeline read the key while the phone is locked (ADR-0002). */
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } as const;

const KEY_PREFIX = 'sk-or-';
/** Sanity bounds on the whole key, prefix included. They catch pasted prose, not every bad key. */
const MIN_KEY_LENGTH = 20;
const MAX_KEY_LENGTH = 200;
const KEY_BODY = /^[A-Za-z0-9_-]+$/;

export type ApiKeyStatus = 'unknown' | 'missing' | 'present';

export class InvalidApiKeyError extends Error {
  constructor() {
    super(
      'That does not look like an OpenRouter key. Keys start with "sk-or-". Check the copy and try again.',
    );
    this.name = 'InvalidApiKeyError';
  }
}

/** Shape check only. A well-formed key can still be revoked, so the real check is `GET /key`. */
export function isWellFormedApiKey(key: string): boolean {
  if (!key.startsWith(KEY_PREFIX)) return false;
  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) return false;
  return KEY_BODY.test(key.slice(KEY_PREFIX.length));
}

/** The saved key, or null when none is saved. Read errors propagate to the caller. */
export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_NAME, STORE_OPTIONS);
}

/** Trims and format-checks the key, then saves it. Throws InvalidApiKeyError without saving. */
export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!isWellFormedApiKey(trimmed)) {
    throw new InvalidApiKeyError();
  }
  await SecureStore.setItemAsync(KEY_NAME, trimmed, STORE_OPTIONS);
  publishStatus('present');
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME, STORE_OPTIONS);
  publishStatus('missing');
}

let currentStatus: ApiKeyStatus = 'unknown';
const listeners = new Set<() => void>();

function publishStatus(next: ApiKeyStatus): void {
  if (next === currentStatus) return;
  currentStatus = next;
  listeners.forEach((listener) => listener());
}

/** Reads the keystore once and publishes 'present' or 'missing'. A read error leaves 'unknown'. */
export async function refreshApiKeyStatus(): Promise<void> {
  try {
    const key = await getApiKey();
    publishStatus(key === null ? 'missing' : 'present');
  } catch {
    publishStatus('unknown');
  }
}

/** The last published status, for code that is not a React component. */
export function getApiKeyStatus(): ApiKeyStatus {
  return currentStatus;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a key is saved. 'unknown' until the first read finishes, or after a read error. */
export function useApiKeyStatus(): ApiKeyStatus {
  const status = useSyncExternalStore(
    subscribe,
    () => currentStatus,
    () => 'unknown' as const,
  );
  useEffect(() => {
    if (status === 'unknown') {
      void refreshApiKeyStatus();
    }
  }, [status]);
  return status;
}
