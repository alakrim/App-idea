import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  createPlaybackHealthLog,
  type PlaybackHealthLog,
  type PlaybackHealthSummary,
} from '@/core/playback/playback-health';

export interface PlaybackHealthState {
  summary: PlaybackHealthSummary;
}

/** The health log as a small store: every record refreshes the summary the Diagnostics card shows. */
export interface PlaybackHealthStore extends PlaybackHealthLog {
  store: StoreApi<PlaybackHealthState>;
  /** Recomputes the summary now, so the observed span is current when a screen opens. */
  refresh(): void;
}

export function createPlaybackHealthStore(now: () => number): PlaybackHealthStore {
  const log = createPlaybackHealthLog({ now });
  const store = createStore<PlaybackHealthState>(() => ({ summary: log.summary() }));
  const record = (apply: () => void) => () => {
    apply();
    store.setState({ summary: log.summary() });
  };
  return {
    store,
    refresh: () => store.setState({ summary: log.summary() }),
    boundaryStarted: record(() => log.boundaryStarted()),
    boundaryPlaying: record(() => log.boundaryPlaying()),
    bufferingStarted: record(() => log.bufferingStarted()),
    ranDry: record(() => log.ranDry()),
    focusLossPaused: record(() => log.focusLossPaused()),
    summary: () => log.summary(),
  };
}

/** The app's playback health, recorded by the narration player and shown in Diagnostics. */
export const playbackHealth = createPlaybackHealthStore(() => Date.now());

/** The playback health summary. Re-renders when a boundary, buffer, run-dry or focus pause is recorded. */
export function usePlaybackHealthSummary(): PlaybackHealthSummary {
  return useStore(playbackHealth.store, (state) => state.summary);
}
