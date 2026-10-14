/*
 * The Android 13+ notification permission. The foreground service runs without it; Android only
 * hides its notification. Before Android 13 there is no runtime permission, and off Android there is
 * no foreground service, so both report granted and nothing is asked.
 */
import { PermissionsAndroid, Platform } from 'react-native';

export interface NotificationPermissionPort {
  isGranted(): Promise<boolean>;
  /** Asks the system. Resolves true when the user allowed notifications. */
  request(): Promise<boolean>;
}

/** Android 13 (API 33) is the first release with a runtime notification permission. */
export const RUNTIME_NOTIFICATION_SDK = 33;

export interface NotificationPermissionDeps {
  readonly os: string;
  readonly sdkVersion: number;
  readonly android: {
    check(permission: string): Promise<boolean>;
    request(permission: string): Promise<string>;
  };
  readonly permission: string;
  readonly grantedResult: string;
}

const NOT_NEEDED: NotificationPermissionPort = {
  isGranted: () => Promise.resolve(true),
  request: () => Promise.resolve(true),
};

export function createNotificationPermission(
  deps: NotificationPermissionDeps = {
    os: Platform.OS,
    sdkVersion: Number(Platform.Version),
    android: PermissionsAndroid,
    permission: PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    grantedResult: PermissionsAndroid.RESULTS.GRANTED,
  },
): NotificationPermissionPort {
  if (deps.os !== 'android' || deps.sdkVersion < RUNTIME_NOTIFICATION_SDK) return NOT_NEEDED;
  return {
    isGranted: () => deps.android.check(deps.permission),
    request: async () => (await deps.android.request(deps.permission)) === deps.grantedResult,
  };
}
