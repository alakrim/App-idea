import type { ForegroundNotification } from '@/services/pipeline/background-notification';

import {
  createForegroundService,
  FOREGROUND_TASK_NAME,
  NOTIFICATION_ICON,
  NOTIFICATION_LINK,
} from './foreground-service';

import type { ForegroundLibrary } from './foreground-service';

const NOTIFICATION: ForegroundNotification = {
  title: 'The night harbour',
  text: 'Narrating · passage 5 of 18',
  progress: { value: 4, max: 18, indeterminate: false },
};

function fakeLibrary(): ForegroundLibrary {
  return {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    updateNotification: jest.fn(() => Promise.resolve()),
  } as unknown as ForegroundLibrary;
}

describe('createForegroundService', () => {
  it('is a no-op off Android, where there is no foreground service', async () => {
    const library = fakeLibrary();
    const service = createForegroundService({ os: 'ios', library });

    expect(service.supported).toBe(false);
    await service.start(() => Promise.resolve(), NOTIFICATION);
    await service.update(NOTIFICATION);
    await service.stop();
    expect(library.start).not.toHaveBeenCalled();
    expect(library.updateNotification).not.toHaveBeenCalled();
    expect(library.stop).not.toHaveBeenCalled();
  });

  it('starts a dataSync service with the chapter title, step, icon and deep link', async () => {
    const library = fakeLibrary();
    const service = createForegroundService({ os: 'android', library });
    const task = () => Promise.resolve();

    await service.start(task, NOTIFICATION);

    expect(library.start).toHaveBeenCalledWith(task, {
      taskName: FOREGROUND_TASK_NAME,
      foregroundServiceType: ['dataSync'],
      taskTitle: 'The night harbour',
      taskDesc: 'Narrating · passage 5 of 18',
      taskIcon: NOTIFICATION_ICON,
      color: expect.stringMatching(/^#[0-9A-F]{6}$/i) as unknown as string,
      linkingURI: NOTIFICATION_LINK,
      progressBar: { max: 18, value: 4, indeterminate: false },
    });
  });

  it('updates the notification without the task name or the service type', async () => {
    const library = fakeLibrary();
    const service = createForegroundService({ os: 'android', library });

    await service.update({
      ...NOTIFICATION,
      progress: { value: 0, max: 100, indeterminate: true },
    });

    const options = (library.updateNotification as jest.Mock).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(options).not.toHaveProperty('taskName');
    expect(options).not.toHaveProperty('foregroundServiceType');
    expect(options['progressBar']).toEqual({ max: 100, value: 0, indeterminate: true });
  });

  it('passes a refused start through as a rejection, for the runner to record', async () => {
    const library = fakeLibrary();
    (library.start as jest.Mock).mockRejectedValueOnce(new Error('not allowed'));
    const service = createForegroundService({ os: 'android', library });

    await expect(service.start(() => Promise.resolve(), NOTIFICATION)).rejects.toThrow(
      'not allowed',
    );
  });

  it('stops the library service', async () => {
    const library = fakeLibrary();
    const service = createForegroundService({ os: 'android', library });

    await service.stop();

    expect(library.stop).toHaveBeenCalledTimes(1);
  });
});
