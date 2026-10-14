/*
 * The background service, as Diagnostics reports it: whether the foreground service runs, why it
 * failed to start if it did not, when it last started, and whether the notification permission is
 * granted. A platform without the service is skipped, not failed.
 */
import type { ForegroundServiceStatus } from '@/services/pipeline/foreground-status';

import type { ProbeOutcome } from './probe';

export interface BackgroundDiagnostics {
  status(): ForegroundServiceStatus;
  /** True or false when the permission can be read, null when the platform does not ask for it. */
  notificationsGranted(): Promise<boolean | null>;
}

export function checkBackgroundService(
  status: ForegroundServiceStatus,
  notificationsGranted: boolean | null,
): ProbeOutcome {
  const values = {
    state: status.state,
    lastStartedAt: status.lastStartedAt,
    failure: status.failure,
    notificationsGranted,
  };
  if (status.state === 'unsupported') {
    return { status: 'skipped', values, message: 'This platform has no foreground service.' };
  }
  if (status.state === 'failed') {
    return {
      status: 'fail',
      values,
      message: status.failure ?? 'The foreground service did not start.',
    };
  }
  return { status: 'pass', values };
}
