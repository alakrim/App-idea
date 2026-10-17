/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { act, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/ui/theme';

import { fixtureChapter, id, setupController } from './__fixtures__/playback-fixtures';
import { PlaybackProvider } from './player-provider';
import { SleepChip } from './sleep-timer';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('@gorhom/bottom-sheet', () => require('./__fixtures__/bottom-sheet-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

describe('SleepChip during the fade (P3)', () => {
  it('says the sleep is fading out once the countdown reaches zero, rather than showing 0:00', async () => {
    const setup = setupController([fixtureChapter(1, 1, 'ready')]);
    await act(async () => {
      await setup.controller.playChapter(id(1));
    });
    const now = Date.now();
    setup.controller.player.setSleepTimer({ mode: 'minutes', minutes: 1 });
    const clock = jest.spyOn(Date, 'now');
    clock.mockReturnValue(now + 60_500);
    try {
      await render(
        <ThemeProvider initialMode="dark">
          <PlaybackProvider controller={setup.controller}>
            <SleepChip onPress={jest.fn()} />
          </PlaybackProvider>
        </ThemeProvider>,
      );

      expect(screen.getByText('Sleep fading out')).toBeOnTheScreen();
      expect(screen.queryByText(/0:00/)).toBeNull();
    } finally {
      clock.mockRestore();
      setup.controller.dispose();
    }
  });
});
