import { router } from 'expo-router';

import { goBackOrHome } from './navigation';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
}));

describe('goBackOrHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('goes back when the screen was opened from another screen', () => {
    jest.mocked(router.canGoBack).mockReturnValue(true);

    goBackOrHome();

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the library instead of going back into nothing, after a deep link', () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);

    goBackOrHome();

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
