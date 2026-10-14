import { createNotificationPermission, RUNTIME_NOTIFICATION_SDK } from './notification-permission';

const PERMISSION = 'android.permission.POST_NOTIFICATIONS';

function fakeAndroid(result: string = 'granted', checked = true) {
  return {
    check: jest.fn(() => Promise.resolve(checked)),
    request: jest.fn(() => Promise.resolve(result)),
  };
}

function deps(os: string, sdkVersion: number, android = fakeAndroid()) {
  return { os, sdkVersion, android, permission: PERMISSION, grantedResult: 'granted' };
}

describe('createNotificationPermission', () => {
  it('reports granted without asking on Android before 13, where no runtime permission exists', async () => {
    const android = fakeAndroid('denied', false);
    const permission = createNotificationPermission(
      deps('android', RUNTIME_NOTIFICATION_SDK - 1, android),
    );

    expect(await permission.isGranted()).toBe(true);
    expect(await permission.request()).toBe(true);
    expect(android.request).not.toHaveBeenCalled();
  });

  it('reports granted without asking off Android', async () => {
    const android = fakeAndroid('denied', false);
    const permission = createNotificationPermission(deps('ios', 17, android));

    expect(await permission.isGranted()).toBe(true);
    expect(android.check).not.toHaveBeenCalled();
  });

  it('checks the POST_NOTIFICATIONS permission on Android 13 and later', async () => {
    const android = fakeAndroid('granted', false);
    const permission = createNotificationPermission(
      deps('android', RUNTIME_NOTIFICATION_SDK, android),
    );

    expect(await permission.isGranted()).toBe(false);
    expect(android.check).toHaveBeenCalledWith(PERMISSION);
  });

  it('asks the system, and reports only a grant as granted', async () => {
    const granted = createNotificationPermission(deps('android', 34, fakeAndroid('granted')));
    const refused = createNotificationPermission(
      deps('android', 34, fakeAndroid('never_ask_again')),
    );

    expect(await granted.request()).toBe(true);
    expect(await refused.request()).toBe(false);
  });
});
