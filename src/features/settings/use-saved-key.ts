import { useEffect, useState } from 'react';

import { getApiKey, useApiKeyStatus } from '@/services/secrets';

import { keyTail } from './format';

export interface SavedKeyView {
  status: 'unknown' | 'missing' | 'present';
  /** The last four characters of the saved key. The full key is never kept in state. */
  tail: string | null;
}

/** Whether a key is saved, and its last four characters. Never exposes the full key. */
export function useSavedKey(): SavedKeyView {
  const status = useApiKeyStatus();
  const [tail, setTail] = useState<string | null>(null);

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
  }, [status]);

  return { status, tail };
}
