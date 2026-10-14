import type { ForegroundServiceStatus } from '@/services/pipeline/foreground-status';

import { checkBackgroundService } from './checks-background';

const NOW = 1_700_000_000_000;

function status(overrides: Partial<ForegroundServiceStatus>): ForegroundServiceStatus {
  return { state: 'stopped', lastStartedAt: null, failure: null, ...overrides };
}

describe('checkBackgroundService', () => {
  it('passes a running service and reports when it last started and the permission', () => {
    const outcome = checkBackgroundService(status({ state: 'running', lastStartedAt: NOW }), true);

    expect(outcome.status).toBe('pass');
    expect(outcome.values).toEqual({
      state: 'running',
      lastStartedAt: NOW,
      failure: null,
      notificationsGranted: true,
    });
  });

  it('fails a refused start with the reason, so the report names it', () => {
    const outcome = checkBackgroundService(
      status({ state: 'failed', failure: 'Foreground service start not allowed' }),
      false,
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toBe('Foreground service start not allowed');
    expect(outcome.values['notificationsGranted']).toBe(false);
  });

  it('skips a platform without the service rather than failing it', () => {
    const outcome = checkBackgroundService(status({ state: 'unsupported' }), null);

    expect(outcome.status).toBe('skipped');
    expect(outcome.values['notificationsGranted']).toBeNull();
  });

  it('passes a stopped service: nothing is queued, so nothing should run', () => {
    expect(checkBackgroundService(status({ state: 'stopped' }), true).status).toBe('pass');
  });
});
