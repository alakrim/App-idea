import { checkBackgroundService } from './checks-background';

describe('checkBackgroundService', () => {
  it('passes a running service and reports the notification permission', () => {
    const outcome = checkBackgroundService({ processing: true, notifications: 'granted' });

    expect(outcome.status).toBe('pass');
    expect(outcome.values).toEqual({ processing: 'running', notifications: 'granted' });
  });

  it('passes a stopped service: nothing is queued, so nothing should run', () => {
    const outcome = checkBackgroundService({ processing: false, notifications: 'denied' });

    expect(outcome.status).toBe('pass');
    expect(outcome.values).toEqual({ processing: 'stopped', notifications: 'denied' });
  });

  it('reports an undetermined permission as it is, not as a failure', () => {
    const outcome = checkBackgroundService({ processing: false, notifications: 'undetermined' });

    expect(outcome.status).toBe('pass');
    expect(outcome.values['notifications']).toBe('undetermined');
  });

  it('skips a platform without the service rather than failing it', () => {
    const outcome = checkBackgroundService(null);

    expect(outcome.status).toBe('skipped');
    expect(outcome.message).toBe('This platform has no processing service.');
  });
});
