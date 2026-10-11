import { act, renderHook } from '@testing-library/react-native';

import { useFollowPause } from './follow-pause';

describe('useFollowPause', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is not paused until the listener scrolls', async () => {
    const { result } = await renderHook(() => useFollowPause(5000));

    expect(result.current?.paused).toBe(false);
  });

  it('pauses for the window, then resumes on its own', async () => {
    const { result } = await renderHook(() => useFollowPause(5000));

    await act(async () => result.current?.pause());
    expect(result.current?.paused).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(4999);
    });
    expect(result.current?.paused).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current?.paused).toBe(false);
  });

  it('restarts the window when the listener keeps scrolling', async () => {
    const { result } = await renderHook(() => useFollowPause(5000));

    await act(async () => result.current?.pause());
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    await act(async () => result.current?.pause());
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    expect(result.current?.paused).toBe(true);
  });
});
