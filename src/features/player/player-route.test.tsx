import { act, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import PlayerScreen from '../../../app/player';
import { PlaybackProvider } from './player-provider';
import { fixtureChapter, id, setupController } from './__fixtures__/playback-fixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('@gorhom/bottom-sheet', () => require('./__fixtures__/bottom-sheet-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
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
            <PlaybackProvider controller={controller}>
              <PlayerScreen />
            </PlaybackProvider>
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
