/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import type { PipelineEvent } from '@/core/pipeline/context';
import type { QueueSnapshot } from '@/core/pipeline/queue';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { DbContext } from '@/db/hooks';
import type { PipelineRuntime } from '@/services/pipeline';
import { ThemeProvider } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import { PipelineLifecycle } from './pipeline-lifecycle';
import { PipelineProvider } from './pipeline-provider';

import type { ReactElement } from 'react';

// The lifecycle reads the pipeline through the provider and never loads the app pipeline itself.
jest.mock('@/services/pipeline', () => ({ createLectioPipelineRuntime: jest.fn() }));
jest.mock('@/services/pipeline/webview-host', () => ({ WebViewHost: () => null }));
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
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

const CHAPTER = '01J00000000000000000000CHP';
const IDLE: QueueSnapshot = { running: null, pending: [] };
const RUNNING: QueueSnapshot = { running: CHAPTER, pending: [] };

/** A runtime whose queue and events the test drives by hand. */
function fakeRuntime() {
  let snapshotListener: ((snapshot: QueueSnapshot) => void) | null = null;
  let eventListener: ((event: PipelineEvent) => void) | null = null;
  let paused = false;
  const runtime = {
    facade: {},
    restore: jest.fn(() => Promise.resolve()),
    resume: jest.fn(() => {
      paused = false;
    }),
    isPaused: () => paused,
    idle: () => Promise.resolve(),
    subscribeQueue: (listener: (snapshot: QueueSnapshot) => void) => {
      snapshotListener = listener;
      return () => {
        snapshotListener = null;
      };
    },
    subscribeEvents: (listener: (event: PipelineEvent) => void) => {
      eventListener = listener;
      return () => {
        eventListener = null;
      };
    },
  };
  return {
    runtime: runtime as unknown as PipelineRuntime,
    pause: () => {
      paused = true;
    },
    queue: async (snapshot: QueueSnapshot) => {
      await act(async () => {
        snapshotListener?.(snapshot);
      });
    },
    event: async (event: PipelineEvent) => {
      await act(async () => {
        eventListener?.(event);
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

  it('does not keep the screen awake for a queue that is paused on a missing key', async () => {
    const fake = fakeRuntime();
    apiKey.status = 'missing';
    fake.pause();
    await mount(fake.runtime);
    await fake.queue({ running: null, pending: [CHAPTER] });
    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
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
