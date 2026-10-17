import { act, render, renderHook } from '@testing-library/react-native';

import { useDisposeController } from './use-dispose-controller';

import type { PlaybackController } from './playback-controller';

type FakeController = PlaybackController & { dispose: jest.Mock };

interface TargetProps {
  target: PlaybackController;
}

function fakeController(): FakeController {
  // Only dispose is used by the hook. The rest of the controller is not needed here.
  return { dispose: jest.fn() } as unknown as FakeController;
}

function useTarget({ target }: TargetProps): void {
  useDisposeController(target);
}

/** A host whose key changes: the old one unmounts and the new one mounts in the same commit. */
function Host({ target }: TargetProps) {
  useDisposeController(target);
  return null;
}

/**
 * Lets a deferred dispose run. The dispose is a zero-delay timer, so a cancelled one never fires
 * and a pending one fires within this wait.
 */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

describe('useDisposeController (QA-E E-12)', () => {
  it('keeps the controller alive when its effect is cleaned up and set up again in one commit', async () => {
    // StrictMode runs cleanup then setup on the same controller within one commit. A key change
    // reproduces that: the old host's cleanup runs, then the new host's setup for the same controller.
    const controller = fakeController();
    const screen = await render(<Host key="first" target={controller} />);

    await act(async () => {
      screen.rerender(<Host key="second" target={controller} />);
    });
    await settle();

    expect(controller.dispose).not.toHaveBeenCalled();
  });

  it('disposes the controller once the provider unmounts', async () => {
    const controller = fakeController();
    const hook = await renderHook(useTarget, { initialProps: { target: controller } });

    await act(async () => {
      hook.unmount();
    });
    await settle();

    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the previous controller when a new one replaces it', async () => {
    const previous = fakeController();
    const next = fakeController();
    const hook = await renderHook(useTarget, { initialProps: { target: previous } });

    await act(async () => {
      hook.rerender({ target: next });
    });
    await settle();

    expect(previous.dispose).toHaveBeenCalledTimes(1);
    expect(next.dispose).not.toHaveBeenCalled();
  });
});
