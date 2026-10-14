import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import { createTestDb } from '@/db/__fixtures__/test-db';

import { PlaybackSettings } from './playback-settings';
import { settingsStore } from './settings-store';

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load helpers with require() */
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-gesture-handler', () => {
  const pan = {
    enabled: () => pan,
    minDistance: () => pan,
    onBegin: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});
/* eslint-enable @typescript-eslint/no-require-imports */

describe('PlaybackSettings', () => {
  it('shows the saved default speed and saves a new one when the slider is adjusted', async () => {
    const { db } = createTestDb();
    settingsStore.hydrate(db);
    await renderThemed(<PlaybackSettings />);
    expect(screen.getByText('1.0×')).toBeOnTheScreen();

    const slider = screen.getByRole('adjustable', {
      name: 'Default playback speed for new series',
    });
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(settingsStore.getSettings().playback.defaultRate).toBe(1.05);
    expect(screen.getByText('1.05×')).toBeOnTheScreen();
  });
});
