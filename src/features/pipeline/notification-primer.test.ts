import { createNotificationPrimer } from './notification-primer';

import type { NotificationPrimerDeps } from './notification-primer';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fakeDeps(overrides: Partial<NotificationPrimerDeps> = {}) {
  const state = { shown: false };
  const deps: NotificationPrimerDeps = {
    isGranted: jest.fn(() => Promise.resolve(false)),
    isForeground: () => true,
    wasShown: () => state.shown,
    markShown: jest.fn(() => {
      state.shown = true;
    }),
    show: jest.fn(),
    ...overrides,
  };
  return { deps, state };
}

describe('createNotificationPrimer', () => {
  it('shows the sheet and records it when work is queued in the foreground without permission', async () => {
    const { deps } = fakeDeps();
    createNotificationPrimer(deps).queued();
    await flush();

    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(deps.markShown).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the system already allows notifications', async () => {
    const { deps } = fakeDeps({ isGranted: () => Promise.resolve(true) });
    createNotificationPrimer(deps).queued();
    await flush();

    expect(deps.show).not.toHaveBeenCalled();
    expect(deps.markShown).not.toHaveBeenCalled();
  });

  it('does not check or show while the app is in the background', async () => {
    const { deps } = fakeDeps({ isForeground: () => false });
    createNotificationPrimer(deps).queued();
    await flush();

    expect(deps.isGranted).not.toHaveBeenCalled();
    expect(deps.show).not.toHaveBeenCalled();
  });

  it('is asked once: a later queue, in this session or a later one, does not ask again', async () => {
    const { deps, state } = fakeDeps();
    const primer = createNotificationPrimer(deps);
    primer.queued();
    await flush();

    primer.queued();
    await flush();

    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(deps.isGranted).toHaveBeenCalledTimes(1);
    expect(state.shown).toBe(true);
  });

  it('does not start a second check while one is in flight', async () => {
    const { deps } = fakeDeps();
    const primer = createNotificationPrimer(deps);

    primer.queued();
    primer.queued();
    await flush();

    expect(deps.isGranted).toHaveBeenCalledTimes(1);
  });

  it('stays quiet and asks again later when the permission check fails', async () => {
    const isGranted = jest
      .fn<Promise<boolean>, []>()
      .mockRejectedValueOnce(new Error('no permission module'))
      .mockResolvedValueOnce(false);
    const { deps } = fakeDeps({ isGranted });
    const primer = createNotificationPrimer(deps);

    primer.queued();
    await flush();
    expect(deps.show).not.toHaveBeenCalled();

    primer.queued();
    await flush();
    expect(deps.show).toHaveBeenCalledTimes(1);
  });
});
