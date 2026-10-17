/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import type { PipelineEvent } from '@/core/pipeline/context';
import type { QueueSnapshot } from '@/core/pipeline/queue';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { DbContext } from '@/db/hooks';
import { settingsStore } from '@/features/settings/settings-store';
import * as processingService from '@/services/background';
import type { PipelineRuntime } from '@/services/pipeline';
import { createForegroundStatus } from '@/services/pipeline/foreground-status';
import { ThemeProvider } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import { BACKGROUND_NOTICE, PipelineLifecycle } from './pipeline-lifecycle';
import { PipelineProvider } from './pipeline-provider';

import type { ReactElement } from 'react';

// The lifecycle reads the pipeline through the provider and never loads the app pipeline itself.
jest.mock('@/services/pipeline', () => ({ createLectioPipelineRuntime: jest.fn() }));
jest.mock('@/services/pipeline/webview-host', () => ({ WebViewHost: () => null }));
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@gorhom/bottom-sheet', () =>
  require('../../__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('react-native-safe-area-context', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) => createElement(View, null, children),
    SafeAreaView: ({ children, style }: { children: unknown; style: unknown }) =>
      createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() };
  return { router: mockRouter, useRouter: () => mockRouter };
});
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));
const apiKey: { status: 'unknown' | 'missing' | 'present' } = { status: 'present' };
jest.mock('@/services/secrets', () => ({
  useApiKeyStatus: () => apiKey.status,
}));
// The native service is replaced: Jest cannot run a foreground service.
jest.mock('@/services/background', () => ({
  startProcessing: jest.fn(() => Promise.resolve(true)),
  updateProcessing: jest.fn(() => Promise.resolve()),
  stopProcessing: jest.fn(() => Promise.resolve()),
  addCancelListener: jest.fn(() => ({ remove: jest.fn() })),
  addTimeoutListener: jest.fn(() => ({ remove: jest.fn() })),
  notificationPermissionStatus: jest.fn(() => Promise.resolve('granted')),
  requestNotificationPermission: jest.fn(() => Promise.resolve('granted')),
}));
// The explainer has its own tests. Here the user has already answered it. The store is real.
jest.mock('@/features/settings/settings-store', () => ({
  ...jest.requireActual('@/features/settings/settings-store'),
  useSettings: () => ({ settings: { notificationsExplained: true }, patch: jest.fn() }),
}));

const CHAPTER = '01J00000000000000000000CHP';
const IDLE: QueueSnapshot = { running: null, pending: [], waiting: [] };
const RUNNING: QueueSnapshot = { running: CHAPTER, pending: [], waiting: [] };

/** A runtime whose queue and events the test drives by hand. */
function fakeRuntime() {
  const snapshotListeners = new Set<(snapshot: QueueSnapshot) => void>();
  const eventListeners = new Set<(event: PipelineEvent) => void>();
  let paused = false;
  const facade = { subscribe: jest.fn(() => () => undefined), cancel: jest.fn() };
  const runtime = {
    facade,
    foreground: createForegroundStatus(false),
    restore: jest.fn(() => Promise.resolve()),
    resume: jest.fn(() => {
      paused = false;
    }),
    retryNow: jest.fn(),
    isPaused: () => paused,
    idle: () => Promise.resolve(),
    subscribeQueue: (listener: (snapshot: QueueSnapshot) => void) => {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
      };
    },
    subscribeEvents: (listener: (event: PipelineEvent) => void) => {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
  };
  return {
    runtime: runtime as unknown as PipelineRuntime,
    facade,
    pause: () => {
      paused = true;
    },
    /** Delivers a queue snapshot without an act scope, for tests that wrap the work in their own. */
    dispatch: (snapshot: QueueSnapshot) => {
      for (const listener of snapshotListeners) listener(snapshot);
    },
    queue: async (snapshot: QueueSnapshot) => {
      await act(async () => {
        for (const listener of snapshotListeners) listener(snapshot);
      });
    },
    event: async (event: PipelineEvent) => {
      await act(async () => {
        for (const listener of eventListeners) listener(event);
      });
    },
  };
}

function tree(runtime: PipelineRuntime, db: ReturnType<typeof createTestDb>['db']): ReactElement {
  return (
    <DbContext.Provider value={db}>
      <ThemeProvider initialMode="dark">
        <ToastProvider>
          <PipelineProvider factory={() => runtime}>
            <PipelineLifecycle />
          </PipelineProvider>
        </ToastProvider>
      </ThemeProvider>
    </DbContext.Provider>
  );
}

async function mount(runtime: PipelineRuntime) {
  const { db } = createTestDb();
  const view = await render(tree(runtime, db));
  return { view, db };
}

describe('PipelineLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiKey.status = 'present';
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  });

  it('restores the persisted queue once, at boot', async () => {
    const fake = fakeRuntime();
    await mount(fake.runtime);
    expect(fake.runtime.restore).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen awake while a chapter runs, and releases it when the queue is idle', async () => {
    const fake = fakeRuntime();
    await mount(fake.runtime);
    await fake.queue(RUNNING);
    expect(activateKeepAwakeAsync).toHaveBeenCalledWith('lectio-pipeline');
    await fake.queue(IDLE);
    expect(deactivateKeepAwake).toHaveBeenCalledWith('lectio-pipeline');
  });

  it('does not keep the screen awake while the foreground service keeps chapters preparing', async () => {
    const fake = fakeRuntime();
    await mount(fake.runtime);
    fake.runtime.foreground.set('running');
    await fake.queue(RUNNING);
    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
  });

  it('does not keep the screen awake for a queue that is paused on a missing key', async () => {
    const fake = fakeRuntime();
    apiKey.status = 'missing';
    fake.pause();
    await mount(fake.runtime);
    await fake.queue({ running: null, pending: [CHAPTER], waiting: [] });
    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
  });

  it('runs the foreground service while a chapter is queued, and stops it when the queue is idle', async () => {
    const fake = fakeRuntime();
    await mount(fake.runtime);
    await fake.queue(RUNNING);
    expect(processingService.startProcessing).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: CHAPTER }),
    );
    await fake.queue(IDLE);
    expect(processingService.stopProcessing).toHaveBeenCalledTimes(1);
  });

  it('cancels the chapter when its notification is cancelled', async () => {
    const fake = fakeRuntime();
    await mount(fake.runtime);
    const onCancel = jest.mocked(processingService.addCancelListener).mock.calls[0]?.[0];
    await act(async () => {
      onCancel?.(CHAPTER);
    });
    expect(fake.facade.cancel).toHaveBeenCalledWith(CHAPTER);
  });

  it('toasts a finished chapter when the app is in the foreground', async () => {
    const fake = fakeRuntime();
    await mount(fake.runtime);
    await fake.event({ type: 'done', chapterId: CHAPTER });
    expect(screen.getByText('Chapter ready')).toBeTruthy();
  });

  it('offers Connect OpenRouter when a missing key stops the queue, and opens the key screen', async () => {
    const fake = fakeRuntime();
    await mount(fake.runtime);
    await fake.event({
      type: 'error',
      chapterId: CHAPTER,
      stage: 'analyze',
      error: { code: 'AUTH', message: 'Add your key.', retryable: false },
    });
    fireEvent.press(screen.getByRole('button', { name: 'Connect OpenRouter' }));
    expect(router.push).toHaveBeenCalledWith('/settings/api-key');
  });

  it('resumes a paused queue once a key is saved', async () => {
    const fake = fakeRuntime();
    fake.pause();
    apiKey.status = 'missing';
    const { view, db } = await mount(fake.runtime);
    expect(fake.runtime.resume).not.toHaveBeenCalled();

    apiKey.status = 'present';
    await act(async () => {
      view.rerender(tree(fake.runtime, db));
    });
    expect(fake.runtime.resume).toHaveBeenCalledTimes(1);
  });
});

describe('PipelineLifecycle: the background notice', () => {
  /** The AppState listeners the lifecycle has subscribed, by subscription. */
  let listeners: Map<object, (state: string) => void>;

  function changeAppState(state: string): Promise<void> {
    return act(async () => {
      for (const listener of [...listeners.values()]) listener(state);
    });
  }

  beforeEach(() => {
    listeners = new Map();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      const subscription = {};
      listeners.set(subscription, listener as (state: string) => void);
      return {
        remove: () => {
          listeners.delete(subscription);
        },
      } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function mountWithSettings(fake: ReturnType<typeof fakeRuntime>) {
    const { db } = await mount(fake.runtime);
    settingsStore.hydrate(db);
    return db;
  }

  it('shows the notice when the app is left while a chapter is being prepared, and only then', async () => {
    const fake = fakeRuntime();
    await mountWithSettings(fake);
    await fake.queue(RUNNING);

    await changeAppState('background');
    await changeAppState('active');

    expect(screen.getByText(BACKGROUND_NOTICE)).toBeTruthy();
    expect(settingsStore.getSettings().backgroundNoticeShown).toBe(true);
  });

  it('stays quiet while the foreground service keeps the work going', async () => {
    const fake = fakeRuntime();
    await mountWithSettings(fake);
    fake.runtime.foreground.set('running');
    await fake.queue(RUNNING);

    await changeAppState('background');
    await changeAppState('active');

    expect(screen.queryByText(BACKGROUND_NOTICE)).toBeNull();
    expect(settingsStore.getSettings().backgroundNoticeShown).toBe(false);
  });

  it('shows it once: a later return with work in flight stays quiet', async () => {
    const fake = fakeRuntime();
    await mountWithSettings(fake);
    await fake.queue(RUNNING);
    await changeAppState('background');
    await changeAppState('active');
    const patch = jest.spyOn(settingsStore, 'patch');

    await changeAppState('background');
    await changeAppState('active');

    expect(patch).not.toHaveBeenCalled();
  });

  it('stays quiet when nothing was being prepared', async () => {
    const fake = fakeRuntime();
    await mountWithSettings(fake);
    await fake.queue(IDLE);

    await changeAppState('background');
    await changeAppState('active');

    expect(screen.queryByText(BACKGROUND_NOTICE)).toBeNull();
    expect(settingsStore.getSettings().backgroundNoticeShown).toBe(false);
  });

  it('counts a chapter waiting in the queue as work in flight', async () => {
    const fake = fakeRuntime();
    await mountWithSettings(fake);
    await fake.queue({ running: null, pending: [CHAPTER], waiting: [] });

    await changeAppState('background');
    await changeAppState('active');

    expect(screen.getByText(BACKGROUND_NOTICE)).toBeTruthy();
  });
});
