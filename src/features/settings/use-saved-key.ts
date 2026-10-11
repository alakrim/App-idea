import { useEffect, useState } from 'react';

import { getApiKey, useApiKeyStatus } from '@/services/secrets';

import type { OpenRouterClient } from '@/services/openrouter';

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
  const [tail, setTail] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (status !== 'present') {
      setTail(null);
      return;
    }
    let active = true;
    getApiKey()
      .then((key) => {
        if (active) setTail(key === null ? null : keyTail(key));
      })
      .catch(() => {
        if (active) setTail(null);
      });
    return () => {
      active = false;
    };
  }, [status, revision]);

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
  const [state, setState] = useState<SavedAccountState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    let active = true;
    setState({ status: 'checking' });
    client
      .validateKey()
      .then((result) => {
        if (!active) return;
        setState(
          result.valid
            ? { status: 'ready', account: accountFrom(result) }
            : { status: 'failed', message: describeKeyError(result.error) },
        );
      })
      .catch(() => {
        if (active) setState({ status: 'failed', message: CHECK_FAILED });
      });
    return () => {
      active = false;
    };
  }, [client, enabled, attempt]);

  return { state, reload: () => setAttempt((current) => current + 1) };
}
