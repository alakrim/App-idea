import { useCallback, useState } from 'react';

import { isWellFormedApiKey, setApiKey } from '@/services/secrets';

import { checkCandidateKey } from './key-check';
import { describeKeyError, INVALID_KEY_FORMAT_MESSAGE } from './key-format';

import type { KeyCheck } from '@/services/openrouter';

export interface KeyAccount {
  label: string;
  usage: number;
  limitRemaining: number | null;
  isFreeTier: boolean;
}

export type KeyConnection =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'connected'; account: KeyAccount }
  | { status: 'failed'; message: string };

export type KeyChecker = (candidate: string) => Promise<KeyCheck>;

export function accountFrom(check: Extract<KeyCheck, { valid: true }>): KeyAccount {
  return {
    label: check.label,
    usage: check.usage,
    limitRemaining: check.limitRemaining,
    isFreeTier: check.isFreeTier,
  };
}

const SAVE_FAILED_MESSAGE = 'This device could not save the key. Try again.';
const CHECK_FAILED_MESSAGE = 'The key check stopped unexpectedly. Nothing was saved. Try again.';

/**
 * Validate-then-save for a pasted key. The key is saved only after OpenRouter accepts it, so a
 * typo never replaces a working key.
 */
export function useKeyConnection(check: KeyChecker = checkCandidateKey) {
  const [connection, setConnection] = useState<KeyConnection>({ status: 'idle' });

  const connect = useCallback(
    async (candidate: string): Promise<boolean> => {
      const key = candidate.trim();
      if (!isWellFormedApiKey(key)) {
        setConnection({ status: 'failed', message: INVALID_KEY_FORMAT_MESSAGE });
        return false;
      }

      setConnection({ status: 'checking' });
      let result: KeyCheck;
      try {
        result = await check(key);
      } catch {
        setConnection({ status: 'failed', message: CHECK_FAILED_MESSAGE });
        return false;
      }
      if (!result.valid) {
        setConnection({ status: 'failed', message: describeKeyError(result.error) });
        return false;
      }

      try {
        await setApiKey(key);
      } catch {
        setConnection({ status: 'failed', message: SAVE_FAILED_MESSAGE });
        return false;
      }
      setConnection({ status: 'connected', account: accountFrom(result) });
      return true;
    },
    [check],
  );

  const reset = useCallback(() => setConnection({ status: 'idle' }), []);

  return { connection, connect, reset };
}
