/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { act, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VocabActionsProvider } from '@/features/vocab/vocab-provider';
import { ThemeProvider } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import {
  SEGMENT_ONE,
  fixtureChapter,
  flush,
  id,
  setupController,
} from './__fixtures__/playback-fixtures';
import { PlaybackProvider } from './player-provider';
import PlayerScreen from '../../../app/player';

// The vocab provider reads the database and OpenRouter before it uses the injected actions.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('../../__tests__/helpers/swipeable-stub'),
);
jest.mock('@/db/hooks', () => ({ useDb: () => ({}) }));
jest.mock('@/app-shell/openrouter-provider', () => ({ useOpenRouter: () => ({}) }));

const noVocabActions = {
  saveToVocab: () => 'unused',
  hasSaved: () => false,
  retryExplanation: () => undefined,
  isPending: () => false,
  failureOf: () => null,
  getVersion: () => 0,
  subscribe: () => () => undefined,
};

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('@gorhom/bottom-sheet', () => require('./__fixtures__/bottom-sheet-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const PHONE_FRAME = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('/player route', () => {
  it('starts the chapter named in the chapterId parameter', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ chapterId: id(1) });
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);

    await render(
      <ThemeProvider initialMode="dark">
        <SafeAreaProvider initialMetrics={PHONE_FRAME}>
          <ToastProvider>
            <VocabActionsProvider actions={noVocabActions}>
              <PlaybackProvider controller={controller}>
                <PlayerScreen />
              </PlaybackProvider>
            </VocabActionsProvider>
          </ToastProvider>
        </SafeAreaProvider>
      </ThemeProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(controller.content.getState().chapterId).toBe(id(1));
    expect(controller.content.getState().status).toBe('ready');
    expect(screen.getByText('Chapter 1')).toBeOnTheScreen();
  });
});

describe('/player route after auto-advance (P1-1)', () => {
  it('keeps the chapter that auto-advance moved to, and does not replay the route chapter', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ chapterId: id(1) });
    const { controller, engine } = setupController([
      fixtureChapter(1, 1, 'ready'),
      fixtureChapter(2, 2, 'ready', [SEGMENT_ONE]),
    ]);
    const seen: string[] = [];
    controller.content.subscribe((state) =>
      seen.push(`${state.chapterId?.slice(-1)}:${state.status}`),
    );

    await render(
      <ThemeProvider initialMode="dark">
        <SafeAreaProvider initialMetrics={PHONE_FRAME}>
          <ToastProvider>
            <VocabActionsProvider actions={noVocabActions}>
              <PlaybackProvider controller={controller}>
                <PlayerScreen />
              </PlaybackProvider>
            </VocabActionsProvider>
          </ToastProvider>
        </SafeAreaProvider>
      </ThemeProvider>,
    );
    await act(async () => {
      await flush();
    });
    await act(async () => {
      controller.player.play();
    });
    await act(async () => {
      engine.advance(10_000);
    });
    await act(async () => {
      await flush();
      await flush();
    });

    expect(controller.content.getState().chapterId).toBe(id(2));
    expect(controller.player.getState().nowPlaying?.chapterId).toBe(id(2));
    // The route still names chapter 1, and that must not start it again.
    expect(seen.filter((entry) => entry === '1:loading')).toHaveLength(1);
    expect(seen.at(-1)).not.toBe('1:loading');
  });
});
