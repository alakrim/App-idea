import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createTestDb } from '@/db/__fixtures__/test-db';
import { createFakePipeline } from '@/features/pipeline/fake-facade';

import { renderWithApp } from './helpers/feature-harness';
import LibraryTab from '../../app/(tabs)/index';

// Jest cannot load Reanimated 4's worklets runtime, lucide ships untransformed ESM, and the sheet
// needs the gesture handler. All are mocked here, as in the other screen tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@gorhom/bottom-sheet', () => require('./helpers/feature-mocks').bottomSheetStub());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-sqlite', () => require('./helpers/fake-expo-sqlite'));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

describe('Library tab empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the designed empty state with a New series call to action', async () => {
    const { db } = createTestDb();
    await renderWithApp(<LibraryTab />, { db, pipeline: createFakePipeline({ db }) });

    expect(screen.getByRole('header', { name: 'Your shelf is empty' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'New series' })).toBeOnTheScreen();
  });

  it('opens the new series modal from the call to action', async () => {
    const { db } = createTestDb();
    await renderWithApp(<LibraryTab />, { db, pipeline: createFakePipeline({ db }) });

    await fireEvent.press(screen.getByRole('button', { name: 'New series' }));

    expect(router.push).toHaveBeenCalledWith('/series/new');
  });
});
