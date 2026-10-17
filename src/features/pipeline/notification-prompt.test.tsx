/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import * as services from '@/services/background';
import type { NotificationPermission } from '@/services/background';

import { NotificationPrompt } from './notification-prompt';

jest.mock('@gorhom/bottom-sheet', () =>
  require('../../__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/services/background', () => ({
  notificationPermissionStatus: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));

const mockSettings = { notificationsExplained: false };
const mockPatch = jest.fn((next: { notificationsExplained?: boolean }) => {
  if (next.notificationsExplained !== undefined)
    mockSettings.notificationsExplained = next.notificationsExplained;
});
jest.mock('@/features/settings/settings-store', () => ({
  useSettings: () => ({ settings: mockSettings, patch: mockPatch }),
}));

const TITLE = 'Keep going in the background';

function permissionIs(status: NotificationPermission) {
  jest.mocked(services.notificationPermissionStatus).mockResolvedValue(status);
}

describe('NotificationPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettings.notificationsExplained = false;
  });

  it('explains the notification the first time a chapter is queued', async () => {
    permissionIs('undetermined');
    await renderThemed(<NotificationPrompt busy />);
    expect(await screen.findByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByText(/quiet notification while it prepares your chapter/)).toBeOnTheScreen();
  });

  it('asks the system when the user allows it, and remembers the answer', async () => {
    permissionIs('undetermined');
    jest.mocked(services.requestNotificationPermission).mockResolvedValue('granted');
    await renderThemed(<NotificationPrompt busy />);
    await screen.findByText(TITLE);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Allow' }));
    });

    expect(services.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith({ notificationsExplained: true });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('remembers "Not now" without asking the system', async () => {
    permissionIs('undetermined');
    await renderThemed(<NotificationPrompt busy />);
    await screen.findByText(TITLE);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    });

    expect(services.requestNotificationPermission).not.toHaveBeenCalled();
    expect(mockPatch).toHaveBeenCalledWith({ notificationsExplained: true });
  });

  it('does not explain again once the user has answered', async () => {
    permissionIs('undetermined');
    mockSettings.notificationsExplained = true;
    await renderThemed(<NotificationPrompt busy />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(services.notificationPermissionStatus).not.toHaveBeenCalled();
  });

  it('stays quiet while nothing is queued', async () => {
    permissionIs('undetermined');
    await renderThemed(<NotificationPrompt busy={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
