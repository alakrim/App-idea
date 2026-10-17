/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stub with require() */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import {
  notificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermission,
} from '@/services/background';

import { NotificationsRow } from './notifications-row';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/services/background', () => ({
  notificationPermissionStatus: jest.fn<Promise<NotificationPermission>, []>(),
  requestNotificationPermission: jest.fn<Promise<'granted' | 'denied'>, []>(),
}));

const statusMock = jest.mocked(notificationPermissionStatus);
const requestMock = jest.mocked(requestNotificationPermission);

describe('NotificationsRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('says notifications are on and what they are for', async () => {
    statusMock.mockResolvedValue('granted');
    await renderThemed(<NotificationsRow />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Notifications, On\. Lectio shows progress while it prepares chapters in the background/,
        }),
      ).toBeOnTheScreen(),
    );
  });

  it('says notifications are off when the system has refused them', async () => {
    statusMock.mockResolvedValue('denied');
    await renderThemed(<NotificationsRow />);

    await waitFor(() => expect(screen.getByRole('button', { name: /, Off\./ })).toBeOnTheScreen());
  });

  it('opens the system settings once the permission has been answered', async () => {
    statusMock.mockResolvedValue('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderThemed(<NotificationsRow />);

    fireEvent.press(await screen.findByRole('button', { name: /Notifications, Off/ }));

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('asks for the permission when it has not been asked yet, and shows the answer', async () => {
    statusMock.mockResolvedValue('undetermined');
    requestMock.mockResolvedValue('granted');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderThemed(<NotificationsRow />);

    fireEvent.press(await screen.findByRole('button', { name: /Notifications, Not asked yet/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Notifications, On\./ })).toBeOnTheScreen(),
    );
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(openSettings).not.toHaveBeenCalled();
  });
});
