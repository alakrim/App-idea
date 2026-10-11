import { createOpenRouterClient } from '@/services/openrouter';

import type { KeyCheck } from '@/services/openrouter';

/** Must match the app identity in src/app-shell/openrouter-provider.ts (HTTP-Referer and X-Title). */
const APP_URL = 'https://lectio.app';
const APP_TITLE = 'Lectio';

/**
 * Checks a key the user has typed but not saved yet, with GET /key. The candidate is held only
 * for this request and is never stored by this function.
 */
export function checkCandidateKey(candidate: string): Promise<KeyCheck> {
  const client = createOpenRouterClient({
    getApiKey: async () => candidate,
    appUrl: APP_URL,
    appTitle: APP_TITLE,
    maxRetries: 1,
  });
  return client.validateKey();
}
