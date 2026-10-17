/*
 * Decides when the notification sheet is asked: the first time a chapter is queued while the app is
 * in the foreground and the system has not granted notifications. It is asked once, so a refusal is
 * remembered and the user is not asked again. Plain promises, no React, so the rule is unit-tested.
 */

export interface NotificationPrimerDeps {
  /** Whether the system already allows notifications. */
  readonly isGranted: () => Promise<boolean>;
  readonly isForeground: () => boolean;
  /** Whether the sheet was shown before, in any session. */
  readonly wasShown: () => boolean;
  /** Records that the sheet is shown, so it is never shown again. */
  readonly markShown: () => void;
  readonly show: () => void;
}

export interface NotificationPrimer {
  /** Call when work is queued. Checks the permission at most once at a time. */
  queued(): void;
}

export function createNotificationPrimer(deps: NotificationPrimerDeps): NotificationPrimer {
  let checking = false;
  return {
    queued() {
      if (checking || !deps.isForeground() || deps.wasShown()) return;
      checking = true;
      deps.isGranted().then(
        (granted) => {
          checking = false;
          if (granted || deps.wasShown()) return;
          deps.markShown();
          deps.show();
        },
        () => {
          checking = false;
        },
      );
    },
  };
}
