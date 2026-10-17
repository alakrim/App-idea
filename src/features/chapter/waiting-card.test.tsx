import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';

import { WaitingCard } from './waiting-card';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));

describe('WaitingCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('says it waits for a connection, and counts down to the next try', async () => {
    await renderThemed(<WaitingCard retryAt={42_000} onRetryNow={jest.fn()} />);
    expect(screen.getByText('Waiting for connection · retrying in 0:42')).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('Waiting for connection · retrying in 0:41')).toBeOnTheScreen();
  });

  it('runs the chapter now when Retry now is pressed', async () => {
    const onRetryNow = jest.fn();
    await renderThemed(<WaitingCard retryAt={42_000} onRetryNow={onRetryNow} />);
    fireEvent.press(screen.getByRole('button', { name: 'Retry now' }));
    expect(onRetryNow).toHaveBeenCalledTimes(1);
  });
});
