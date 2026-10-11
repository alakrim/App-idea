import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderThemed } from './helpers/render-themed';
import LibraryScreen from '../../app/(tabs)/index';

// Jest cannot load Reanimated 4's native worklets runtime, and lucide ships untransformed ESM.
// Both are mocked per file because jest.config.js is owned by the architect.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
}));

describe('Library tab empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the designed empty state with a New series call to action', () => {
    renderThemed(<LibraryScreen />);

    expect(screen.getByRole('header', { name: 'Your shelf is empty' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'New series' })).toBeOnTheScreen();
  });

  it('opens the new series modal from the call to action', () => {
    renderThemed(<LibraryScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'New series' }));

    expect(router.push).toHaveBeenCalledWith('/series/new');
  });
});
