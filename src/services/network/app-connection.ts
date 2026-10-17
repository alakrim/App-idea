import { AppState } from 'react-native';

import { createConnection } from './connection';

import type { Connection } from './connection';

/** How often the heartbeat runs. React Native pauses JS timers while the app is frozen. */
const HEARTBEAT_MS = 1_000;

let singleton: Connection | null = null;

/**
 * The app's connection, shared by the OpenRouter client and the pipeline. Its first use subscribes
 * it to AppState, so both see the same foreground and background moments, and starts the heartbeat
 * that tells a real freeze from a short trip away.
 */
export function getAppConnection(): Connection {
  if (singleton === null) {
    const connection = createConnection();
    connection.heartbeat();
    setInterval(() => connection.heartbeat(), HEARTBEAT_MS);
    AppState.addEventListener('change', (state) => connection.setAppState(state));
    singleton = connection;
  }
  return singleton;
}
