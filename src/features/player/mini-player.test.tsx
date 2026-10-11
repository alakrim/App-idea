/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui/theme';

import { fixtureChapter, id, setupController } from './__fixtures__/playback-fixtures';
import { MiniPlayer, MiniPlayerView } from './mini-player';
import { PlaybackProvider } from './player-provider';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
}));

const PHONE_FRAME = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('MiniPlayer visibility', () => {
  it('stays hidden until a chapter is loaded', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await render(
      <ThemeProvider initialMode="dark">
        <SafeAreaProvider initialMetrics={PHONE_FRAME}>
          <PlaybackProvider controller={controller}>
            <MiniPlayer />
          </PlaybackProvider>
        </SafeAreaProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('mini-player')).toBeNull();

    await act(async () => {
      await controller.playChapter(id(1));
    });

    expect(await screen.findByTestId('mini-player')).toBeOnTheScreen();
    expect(screen.getByText('Chapter 1')).toBeOnTheScreen();
  });

  it('opens the full player when tapped', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await act(async () => {
      await controller.playChapter(id(1));
    });
    await render(
      <ThemeProvider initialMode="dark">
        <SafeAreaProvider initialMetrics={PHONE_FRAME}>
          <PlaybackProvider controller={controller}>
            <MiniPlayer />
          </PlaybackProvider>
        </SafeAreaProvider>
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('mini-player'));

    expect(router.push).toHaveBeenCalledWith('/player');
  });
});

describe('MiniPlayerView', () => {
  it('renders nothing without something to play', async () => {
    await render(
      <ThemeProvider initialMode="dark">
        <MiniPlayerView nowPlaying={null} />
      </ThemeProvider>,
    );

    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('labels its play or pause control from the playing state', async () => {
    const onTogglePlay = jest.fn();
    await render(
      <ThemeProvider initialMode="dark">
        <MiniPlayerView
          nowPlaying={{
            title: 'Chapter 1',
            subtitle: 'Rain fell.',
            coverUri: null,
            progress: 0.5,
            playing: false,
          }}
          onTogglePlay={onTogglePlay}
        />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });
});
