import { AppState } from 'react-native';

import { createConnection } from './connection';

import type { Connection } from './connection';

let singleton: Connection | null = null;

/**
 * The app's connection, shared by the OpenRouter client and the pipeline. Its first use subscribes
 * it to AppState, so both see the same foreground and background moments.
 */
export function getAppConnection(): Connection {
  if (singleton === null) {
    const connection = createConnection();
    AppState.addEventListener('change', (state) => connection.setAppState(state));
    singleton = connection;
  }
  return singleton;
}
