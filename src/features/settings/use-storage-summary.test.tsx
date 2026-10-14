/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stub with require() */
import { act, renderHook } from '@testing-library/react-native';

import { useStorageSummary } from './use-storage-summary';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/services/storage', () => ({
  bytesUsedByLibrary: jest.fn(() => ({ totalBytes: 3 * 1024 * 1024 })),
  freeSpaceBytes: jest.fn(() => 2 * 1024 * 1024 * 1024),
}));

describe('useStorageSummary', () => {
  it('starts in a loading state, then reports the library size and free space', async () => {
    const { result } = await renderHook(() => useStorageSummary());

    expect(result.current).toEqual({ status: 'loading' });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.status).toBe('ready');
    if (result.current.status === 'ready') {
      expect(result.current.text).toContain('used');
      expect(result.current.text).toContain('free');
    }
  });
});
