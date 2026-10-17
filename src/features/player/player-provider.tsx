import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useStore } from 'zustand';

import type { AudioEngine } from '@/audio/engine';
import { useDb } from '@/db/hooks';
import { usePipeline } from '@/features/pipeline/facade';
import { settingsStore } from '@/features/settings/settings-store';

import {
  createPlaybackController,
  type AmbiencePort,
  type PlaybackContent,
  type PlaybackController,
  type PlayChapterOptions,
} from './playback-controller';
import { createPlaybackData } from './playback-data';
import { createDefaultEngine, createDefaultSamples } from './player-engine';
import { useDisposeController } from './use-dispose-controller';

import type { PlayerState } from './player-store';
import type { SampleOutput } from './sample-output';

/** The saved ambience settings, as the playback controller reads and writes them. */
const settingsAmbience: AmbiencePort = {
  read: () => settingsStore.getSettings().ambience,
  write: (next) => settingsStore.patch({ ambience: next }),
  subscribe: (listener) => settingsStore.subscribe((settings) => listener(settings.ambience)),
};

const PlaybackContext = createContext<PlaybackController | null>(null);

export interface PlayerEngineProviderProps {
  children: ReactNode;
  /** Overrides the default engine (native on device, fake on web). Tests and the dev screens pass one. */
  engine?: AudioEngine;
  /** Overrides the sample output. Tests pass one; the app uses the native output. */
  samples?: SampleOutput;
}

/**
 * Owns the one playback controller for the app: the audio engine, the player store and the
 * chapter content. Mount it under DbProvider and PipelineProvider. It also saves the position when
 * the app leaves the foreground.
 */
export function PlayerEngineProvider({ children, engine, samples }: PlayerEngineProviderProps) {
  const db = useDb();
  const pipeline = usePipeline();
  const controller = useMemo(
    () =>
      createPlaybackController({
        data: createPlaybackData(db),
        engine: engine ?? createDefaultEngine(),
        pipeline,
        ambience: settingsAmbience,
        samples: samples ?? createDefaultSamples(),
        defaultRate: () => settingsStore.getSettings().playback.defaultRate,
      }),
    [db, engine, pipeline, samples],
  );

  useDisposeController(controller);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') controller.player.flushPosition();
    });
    return () => subscription.remove();
  }, [controller]);

  return <PlaybackProvider controller={controller}>{children}</PlaybackProvider>;
}

export interface PlaybackProviderProps {
  children: ReactNode;
  controller: PlaybackController;
}

/** Makes a controller available to the player UI. Tests mount it with a controller they built. */
export function PlaybackProvider({ children, controller }: PlaybackProviderProps) {
  return <PlaybackContext.Provider value={controller}>{children}</PlaybackContext.Provider>;
}

/** The playback controller. Throws outside PlayerEngineProvider. */
export function usePlayback(): PlaybackController {
  const controller = useContext(PlaybackContext);
  if (!controller) {
    throw new Error('usePlayback must be used inside <PlayerEngineProvider>.');
  }
  return controller;
}

/** Selects from the player state, such as the position or the play state. */
export function usePlayerState<T>(selector: (state: PlayerState) => T): T {
  const { player } = usePlayback();
  // Call zustand through `useStore`, never through a store held in a variable: the React Compiler
  // only treats `use*` names as hooks, and memoizing a hidden hook call breaks the hook order.
  return useStore(player.usePlayerState, selector);
}

/** Whether a sample (a narrator's clip or a device voice line) is playing. */
export function usePlaybackSampling(): boolean {
  const { sample } = usePlayback();
  return useStore(sample, (state) => state.playing);
}

/** Selects from the content of the chapter in view. */
export function usePlaybackContent<T>(selector: (state: PlaybackContent) => T): T {
  const { content } = usePlayback();
  return useStore(content, selector);
}

/** Starts a chapter from anywhere in the app. The returned function never throws. */
export function usePlayChapter(): (chapterId: string, options?: PlayChapterOptions) => void {
  const controller = usePlayback();
  return useCallback(
    (chapterId: string, options?: PlayChapterOptions) => {
      void controller.playChapter(chapterId, options);
    },
    [controller],
  );
}
