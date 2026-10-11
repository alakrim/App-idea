import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Clipboard, Text } from 'react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import { DbProvider, useDb } from '@/app-shell/db-provider';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { getDatabase } from '@/db/client';
import { settings } from '@/db/schema';
import type { Db } from '@/db/types';
import { useLectioMigrations } from '@/db/use-migrations';
import { settingsStore } from '@/features/settings/settings-store';

// Jest cannot load Reanimated 4's worklets runtime, and lucide ships untransformed ESM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/db/client', () => ({ getDatabase: jest.fn() }));
jest.mock('@/db/use-migrations', () => ({ useLectioMigrations: jest.fn() }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

const getDatabaseMock = jest.mocked(getDatabase);
const migrationsMock = jest.mocked(useLectioMigrations);
const hideAsync = jest.mocked(SplashScreen.hideAsync);

let testDb: Db;

function Probe({ onDb }: { onDb: (db: Db) => void }) {
  const db = useDb();
  useEffect(() => {
    onDb(db);
  }, [db, onDb]);
  return <Text>probe</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  const created = createTestDb();
  testDb = created.db;
  getDatabaseMock.mockReturnValue(testDb as never);
  migrationsMock.mockReturnValue({ success: false, error: undefined });
});

describe('DbProvider', () => {
  it('keeps children and the splash up while migrations run', async () => {
    await renderThemed(
      <DbProvider>
        <Text>library content</Text>
      </DbProvider>,
    );

    expect(screen.queryByText('library content')).toBeNull();
    expect(hideAsync).not.toHaveBeenCalled();
  });

  it('renders children, hides the splash and loads settings once migrations succeed', async () => {
    testDb.insert(settings).values({ key: 'theme', value: '"light"', updatedAt: 1 }).run();
    migrationsMock.mockReturnValue({ success: true, error: undefined });

    await renderThemed(
      <DbProvider>
        <Text>library content</Text>
      </DbProvider>,
    );

    expect(await screen.findByText('library content')).toBeTruthy();
    await waitFor(() => expect(hideAsync).toHaveBeenCalled());
    expect(settingsStore.getSettings().theme).toBe('light');
  });

  it('exposes the open database through useDb()', async () => {
    migrationsMock.mockReturnValue({ success: true, error: undefined });

    const seen: Db[] = [];
    await renderThemed(
      <DbProvider>
        <Probe onDb={(db) => seen.push(db)} />
      </DbProvider>,
    );

    await waitFor(() => expect(seen[0]).toBe(testDb));
  });

  it('shows a designed failure when migrations fail, and Retry reopens the library', async () => {
    migrationsMock.mockReturnValue({ success: false, error: new Error('disk I/O error') });

    await renderThemed(
      <DbProvider>
        <Text>library content</Text>
      </DbProvider>,
    );

    expect(await screen.findByText("We couldn't open your library")).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
    expect(screen.getByLabelText('Copy details')).toBeTruthy();
    expect(screen.queryByText('library content')).toBeNull();
    expect(hideAsync).toHaveBeenCalled();

    const callsBeforeRetry = migrationsMock.mock.calls.length;
    migrationsMock.mockReturnValue({ success: true, error: undefined });
    fireEvent.press(screen.getByLabelText('Try again'));

    expect(await screen.findByText('library content')).toBeTruthy();
    expect(migrationsMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('shows the failure when the database cannot be opened at all', async () => {
    getDatabaseMock.mockImplementation(() => {
      throw new Error('unable to open database file');
    });

    await renderThemed(
      <DbProvider>
        <Text>library content</Text>
      </DbProvider>,
    );

    expect(await screen.findByText("We couldn't open your library")).toBeTruthy();
    expect(migrationsMock).not.toHaveBeenCalled();
  });

  it('copies diagnostics that name the failure but never echo settings', async () => {
    migrationsMock.mockReturnValue({ success: false, error: new Error('locked') });
    const setString = jest.spyOn(Clipboard, 'setString').mockImplementation(() => undefined);

    try {
      await renderThemed(
        <DbProvider>
          <Text>library content</Text>
        </DbProvider>,
      );
      await act(async () => {
        fireEvent.press(await screen.findByLabelText('Copy details'));
      });

      expect(setString).toHaveBeenCalledTimes(1);
      const copied = String(setString.mock.calls[0]?.[0]);
      expect(copied).toContain('Error: locked');
      expect(copied).toContain('opening the library');
      expect(copied).not.toMatch(/sk-or-/);
    } finally {
      setString.mockRestore();
    }
  });
});
