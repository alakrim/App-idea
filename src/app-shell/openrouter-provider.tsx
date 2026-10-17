import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { CATALOG_FILE_STORE, persistCatalog } from '@/services/catalog-cache';
import { getAppConnection } from '@/services/network/app-connection';
import { createOpenRouterClient } from '@/services/openrouter';
import type { OpenRouterClient, OpenRouterClientOptions } from '@/services/openrouter';
import { getApiKey } from '@/services/secrets';

export const LECTIO_APP_URL = 'https://lectio.app';
export const LECTIO_APP_TITLE = 'Lectio';

/**
 * Builds the app's OpenRouter client. The model catalogue is restored from the cache file on its
 * first use, not here, so building the client on the first render does no file I/O. Each
 * successful catalogue fetch rewrites the cache.
 */
export function createLectioOpenRouter(
  options: Pick<OpenRouterClientOptions, 'fetchImpl' | 'now'> = {},
): OpenRouterClient {
  const client = createOpenRouterClient({
    getApiKey,
    appUrl: LECTIO_APP_URL,
    appTitle: LECTIO_APP_TITLE,
    connection: getAppConnection(),
    ...options,
  });
  return { ...client, models: persistCatalog(client.models, CATALOG_FILE_STORE) };
}

let singleton: OpenRouterClient | null = null;

/** The app-wide client. Created on first use, so importing this module has no side effects. */
export function getOpenRouter(): OpenRouterClient {
  if (singleton === null) {
    singleton = createLectioOpenRouter();
  }
  return singleton;
}

const OpenRouterContext = createContext<OpenRouterClient | null>(null);

export interface OpenRouterProviderProps {
  children: ReactNode;
  /** Test seam. Apps leave it out and get the singleton. */
  client?: OpenRouterClient;
}

export function OpenRouterProvider({ children, client }: OpenRouterProviderProps) {
  const value = useMemo(() => client ?? getOpenRouter(), [client]);
  return <OpenRouterContext.Provider value={value}>{children}</OpenRouterContext.Provider>;
}

export function useOpenRouter(): OpenRouterClient {
  const client = useContext(OpenRouterContext);
  if (client === null) {
    throw new Error('useOpenRouter() must be used inside <OpenRouterProvider>.');
  }
  return client;
}
