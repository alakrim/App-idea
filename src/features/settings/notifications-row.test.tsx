/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stub with require() */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';

import { NotificationsRow } from './notifications-row';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  };
});

const mockPermission = { isGranted: jest.fn<Promise<boolean>, []>() };
jest.mock('@/services/background/notification-permission', () => ({
  createNotificationPermission: () => mockPermission,
}));

describe('NotificationsRow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('says notifications are on and what they are for', async () => {
    mockPermission.isGranted.mockResolvedValue(true);
    await renderThemed(<NotificationsRow />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Notifications, On\. Lectio shows progress while it prepares chapters in the background/,
        }),
      ).toBeOnTheScreen(),
    );
  });

  it('says notifications are off when the system has not allowed them', async () => {
    mockPermission.isGranted.mockResolvedValue(false);
    await renderThemed(<NotificationsRow />);

    await waitFor(() => expect(screen.getByRole('button', { name: /, Off\./ })).toBeOnTheScreen());
  });

  it('opens the system settings where the switch lives', async () => {
    mockPermission.isGranted.mockResolvedValue(false);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderThemed(<NotificationsRow />);

    await fireEvent.press(await screen.findByRole('button', { name: /Notifications/ }));

    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
