/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/ui/theme';

import { NotificationPrimerSheet } from './notification-primer-sheet';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@gorhom/bottom-sheet', () =>
  require('../../__tests__/helpers/feature-mocks').bottomSheetStub(),
);

function sheet(visible: boolean, onAllow: () => void, onNotNow: () => void) {
  return (
    <ThemeProvider initialMode="dark">
      <NotificationPrimerSheet visible={visible} onAllow={onAllow} onNotNow={onNotNow} />
    </ThemeProvider>
  );
}

describe('NotificationPrimerSheet', () => {
  it('explains why the notification helps', async () => {
    await render(sheet(true, jest.fn(), jest.fn()));

    expect(screen.getByText('Show progress in notifications')).toBeTruthy();
    expect(
      screen.getByText(/See progress while Lectio prepares chapters in the background/),
    ).toBeTruthy();
  });

  it('calls onAllow when the user allows', async () => {
    const onAllow = jest.fn();
    await render(sheet(true, onAllow, jest.fn()));

    fireEvent.press(screen.getByRole('button', { name: 'Allow notifications' }));

    expect(onAllow).toHaveBeenCalledTimes(1);
  });

  it('calls onNotNow when the user declines', async () => {
    const onNotNow = jest.fn();
    await render(sheet(true, jest.fn(), onNotNow));

    fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(onNotNow).toHaveBeenCalledTimes(1);
  });

  it('shows nothing while closed', async () => {
    await render(sheet(false, jest.fn(), jest.fn()));

    expect(screen.queryByText('Show progress in notifications')).toBeNull();
  });
});
