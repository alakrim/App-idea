import {
  addCancelListener,
  isProcessing,
  notificationPermissionStatus,
  requestNotificationPermission,
  startProcessing,
  stopProcessing,
  updateProcessing,
} from '@/services/background';

// Jest runs on the iOS preset, where the Android service does not exist. Every call must be a safe
// no-op there, so callers never need a platform check.
const NOTICE = { chapterId: 'c1', title: 'The harbour', text: 'Narrating · 40%', progress: 0.4 };

describe('lectio-background without the Android service', () => {
  it('starts nothing, and reports that processing runs without a notification', async () => {
    await expect(startProcessing(NOTICE)).resolves.toBe(false);
    await expect(updateProcessing(NOTICE)).resolves.toBeUndefined();
    await expect(stopProcessing()).resolves.toBeUndefined();
  });

  it('reports that nothing is processing where the service does not exist', async () => {
    await expect(isProcessing()).resolves.toBe(false);
  });

  it('grants the notification permission where no notification is needed', async () => {
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    await expect(notificationPermissionStatus()).resolves.toBe('granted');
  });

  it('returns an inert subscription for the service events', () => {
    const cancel = addCancelListener(() => undefined);
    expect(() => cancel.remove()).not.toThrow();
  });
});
