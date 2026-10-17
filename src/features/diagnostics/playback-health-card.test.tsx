import { act, screen, waitFor } from '@testing-library/react-native';

import { playbackHealth } from '@/audio/playback-health';

import { PlaybackHealthCard } from './playback-health-card';
import { renderThemed } from '../../__tests__/helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('PlaybackHealthCard', () => {
  it('lists every health row, with the boundary and buffering labels', async () => {
    await renderThemed(<PlaybackHealthCard />);

    expect(screen.getByText('Segment boundaries')).toBeOnTheScreen();
    expect(screen.getByText('Boundary gap p95')).toBeOnTheScreen();
    expect(screen.getByText('Buffering starts')).toBeOnTheScreen();
    expect(screen.getByText('Focus-loss pauses')).toBeOnTheScreen();
  });

  it('updates when the narration records a boundary, a buffer and a focus pause', async () => {
    await renderThemed(<PlaybackHealthCard />);

    await act(async () => {
      playbackHealth.boundaryStarted();
      playbackHealth.boundaryPlaying();
      playbackHealth.bufferingStarted();
      playbackHealth.focusLossPaused();
    });

    await waitFor(() => expect(screen.getByText(/^1 \(/)).toBeOnTheScreen());
  });
});
