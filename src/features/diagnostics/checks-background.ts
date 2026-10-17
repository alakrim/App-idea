/*
 * The processing service, as Diagnostics reports it: whether it runs right now and whether the
 * notification permission is granted. Where the platform has no processing service the check is
 * skipped, not failed.
 */
import type { NotificationPermission } from '@/services/background';

import type { ProbeOutcome } from './probe';

export interface BackgroundReadings {
  /** True while the processing service is running. */
  readonly processing: boolean;
  readonly notifications: NotificationPermission;
}

export interface BackgroundDiagnostics {
  /** The readings, or null where the platform has no processing service. */
  read(): Promise<BackgroundReadings | null>;
}

export function checkBackgroundService(readings: BackgroundReadings | null): ProbeOutcome {
  if (readings === null) {
    return { status: 'skipped', values: {}, message: 'This platform has no processing service.' };
  }
  return {
    status: 'pass',
    values: {
      processing: readings.processing ? 'running' : 'stopped',
      notifications: readings.notifications,
    },
  };
}
