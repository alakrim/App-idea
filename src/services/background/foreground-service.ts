/*
 * The Android foreground service behind the background runner, on react-native-background-actions.
 * It shows the progress notification and keeps the JS runtime alive while chapters are prepared. The
 * library is the only native module involved. iOS and web have no foreground service, so the port
 * reports `supported: false` there and does nothing.
 */
import { Platform } from 'react-native';
import backgroundActions from 'react-native-background-actions';

import type { ForegroundNotification } from '@/services/pipeline/background-notification';
import type { ForegroundServicePort } from '@/services/pipeline/background-runner';
import { palette } from '@/ui/tokens';

/** The task name the library registers its headless task under. */
export const FOREGROUND_TASK_NAME = 'lectio-pipeline';
/** A monochrome vector in android/app/src/main/res/drawable, written by with-background-processing. */
export const NOTIFICATION_ICON = { name: 'ic_stat_lectio', type: 'drawable' } as const;
/** A tap on the notification opens the app, which lands on the library. */
export const NOTIFICATION_LINK = 'lectio://';

/** The subset of the library the adapter calls. Tests pass a fake. */
export interface ForegroundLibrary {
  start: typeof backgroundActions.start;
  stop: typeof backgroundActions.stop;
  updateNotification: typeof backgroundActions.updateNotification;
}

export interface ForegroundServiceDeps {
  /** The platform the app runs on, as Platform.OS names it. */
  readonly os: string;
  readonly library: ForegroundLibrary;
}

const UNSUPPORTED: ForegroundServicePort = {
  supported: false,
  start: () => Promise.resolve(),
  update: () => Promise.resolve(),
  stop: () => Promise.resolve(),
};

/** The notification fields, shared by the first start and the later updates. */
function notificationFields(notification: ForegroundNotification) {
  return {
    taskTitle: notification.title,
    taskDesc: notification.text,
    taskIcon: NOTIFICATION_ICON,
    color: palette.dark.accent,
    linkingURI: NOTIFICATION_LINK,
    progressBar: {
      max: notification.progress.max,
      value: notification.progress.value,
      indeterminate: notification.progress.indeterminate,
    },
  };
}

export function createForegroundService(
  deps: ForegroundServiceDeps = { os: Platform.OS, library: backgroundActions },
): ForegroundServicePort {
  if (deps.os !== 'android') return UNSUPPORTED;
  const { library } = deps;
  return {
    supported: true,
    start: (task, notification) =>
      library.start(task, {
        taskName: FOREGROUND_TASK_NAME,
        // dataSync is the type for work the app does for the user, such as preparing audio.
        foregroundServiceType: ['dataSync'],
        ...notificationFields(notification),
      }),
    update: (notification) => library.updateNotification(notificationFields(notification)),
    stop: () => library.stop(),
  };
}
