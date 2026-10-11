import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { readLastCrashReport, type StoredCrashReport } from '@/app-shell/crash-store';

import { LastCrashCard } from './last-crash-card';
import { renderThemed } from '../../__tests__/helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/app-shell/crash-store', () => ({ readLastCrashReport: jest.fn(() => null) }));

const readMock = jest.mocked(readLastCrashReport);

function setReport(report: StoredCrashReport | null): void {
  readMock.mockReturnValue(report);
}

describe('LastCrashCard', () => {
  beforeEach(() => {
    jest.mocked(Clipboard.setStringAsync).mockClear();
    setReport(null);
  });

  it('says so when no crash has been recorded', async () => {
    await renderThemed(<LastCrashCard />);

    expect(screen.getByText('No crash recorded')).toBeOnTheScreen();
    expect(screen.queryByText('Copy crash report')).toBeNull();
  });

  it('previews the first lines of a pending report', async () => {
    const lines = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`);
    setReport({ text: lines.join('\n'), kept: 'current' });

    await renderThemed(<LastCrashCard />);

    expect(
      screen.getByText('Not yet shown on launch. Copy it and send it to us.'),
    ).toBeOnTheScreen();
    expect(screen.getByText(lines.slice(0, 40).join('\n'), { exact: false })).toBeOnTheScreen();
    expect(screen.queryByText(/line 41/)).toBeNull();
  });

  it('copies the whole report, not only the preview', async () => {
    const text = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n');
    setReport({ text, kept: 'previous' });

    await renderThemed(<LastCrashCard />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy crash report' }));
    });

    await waitFor(() => expect(screen.getByText('Crash report copied')).toBeOnTheScreen());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(text);
    expect(screen.getByText('From the last crash. Copy it and send it to us.')).toBeOnTheScreen();
  });
});
