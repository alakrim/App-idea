import { useEffect, useState } from 'react';

import type { OpenRouterClient } from '@/services/openrouter';
import { getApiKey, useApiKeyStatus } from '@/services/secrets';

import { keyTail } from './format';
import { describeKeyError } from './key-format';
import { accountFrom, type KeyAccount } from './use-key-connection';

const CHECK_FAILED = 'The key could not be checked. Check your connection and try again.';

export interface SavedKeyView {
  status: 'unknown' | 'missing' | 'present';
  /** The last four characters of the saved key. The full key is never kept in state. */
  tail: string | null;
  /** Re-reads the saved key, for after it has been replaced. */
  refresh: () => void;
}

/** Whether a key is saved, and its last four characters. Never exposes the full key. */
export function useSavedKey(): SavedKeyView {
  const status = useApiKeyStatus();
  const [tailRead, setTailRead] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (status !== 'present') return;
    let active = true;
    getApiKey()
      .then((key) => {
        if (active) setTailRead(key === null ? null : keyTail(key));
      })
      .catch(() => {
        if (active) setTailRead(null);
      });
    return () => {
      active = false;
    };
  }, [status, revision]);

  // Nothing is shown without a saved key. The last read stays until a newer one arrives.
  const tail = status === 'present' ? tailRead : null;
  return { status, tail, refresh: () => setRevision((current) => current + 1) };
}

export type SavedAccountState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ready'; account: KeyAccount }
  | { status: 'failed'; message: string };

/**
 * What OpenRouter says about the saved key (GET /key through the app client). Runs whenever
 * `enabled` turns on, and again on `reload`. Failures are text and never block the screen.
 */
export function useSavedKeyAccount(
  client: OpenRouterClient,
  enabled: boolean,
): { state: SavedAccountState; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ attempt: number; state: SavedAccountState } | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    client
      .validateKey()
      .then((result) => {
        if (!active) return;
        setSettled({
          attempt,
          state: result.valid
            ? { status: 'ready', account: accountFrom(result) }
            : { status: 'failed', message: describeKeyError(result.error) },
        });
      })
      .catch(() => {
        if (active) setSettled({ attempt, state: { status: 'failed', message: CHECK_FAILED } });
      });
    return () => {
      active = false;
    };
  }, [client, enabled, attempt]);

  let state: SavedAccountState = { status: 'idle' };
  if (enabled) {
    state = settled?.attempt === attempt ? settled.state : { status: 'checking' };
  }
  return { state, reload: () => setAttempt((current) => current + 1) };
}
