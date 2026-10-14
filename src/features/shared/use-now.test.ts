import { renderHook, act } from '@testing-library/react-native';

import { useNow } from './use-now';

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes the time every interval while enabled', async () => {
    const { result } = await renderHook(() => useNow(1_000, true));
    expect(result.current).toBe(1_000);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(4_000);
  });

  it('stays still and sets no interval while disabled', async () => {
    const setInterval = jest.spyOn(globalThis, 'setInterval');
    const { result } = await renderHook(() => useNow(1_000, false));

    await act(async () => {
      jest.setSystemTime(9_000);
      jest.advanceTimersByTime(5_000);
    });

    expect(result.current).toBe(1_000);
    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });
});
