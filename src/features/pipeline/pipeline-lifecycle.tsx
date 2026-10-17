/*
 * The app-side life of the pipeline, mounted once under the toasts. It resumes the persisted queue
 * at boot, and runs the background runner: a foreground service keeps chapters preparing when the
 * app leaves the foreground. Where that service cannot run (iOS, web, or a refused start) the screen
 * is kept awake instead, and a one-time notice says the work pauses in the background. It toasts a
 * finished chapter when the app is in the foreground, and offers "Connect OpenRouter" when a missing
 * key pauses the queue. It resumes the queue once a key is saved, and it asks once, before the first
 * chapter is queued, for the notification permission. It also hosts the hidden WebView.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { TIMER_SCHEDULER } from '@/core/pipeline/retry-policy';
import { useDb } from '@/db/hooks';
import { chapterRepo } from '@/db/repos/chapter-repo';
import * as processingService from '@/services/background';
import { WebViewHost } from '@/services/pipeline/webview-host';
import { useApiKeyStatus } from '@/services/secrets';
import { useToast } from '@/ui/toast';

import { BackgroundWork, isQueueBusy } from './background-work';
import { NotificationPrompt } from './notification-prompt';
import { usePipelineRuntime } from './pipeline-provider';

export const KEEP_AWAKE_TAG = 'lectio-pipeline';
export const CONNECT_ROUTE = '/settings/api-key';
/** Shown in the notification when a chapter has no title yet. */
const APP_NAME = 'Lectio';

export function PipelineLifecycle() {
  const runtime = usePipelineRuntime();
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const keyStatus = useApiKeyStatus();
  const db = useDb();
  const restored = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!runtime || restored.current) return;
    restored.current = true;
    void runtime.restore().catch(() => undefined);
  }, [runtime]);

  useEffect(() => {
    if (!runtime) return undefined;
    const runner = createBackgroundRunner({
      queue: {
        subscribe: runtime.subscribeQueue,
        isPaused: () => runtime.isPaused(),
        idle: () => runtime.idle(),
      },
      progress: runtime.facade,
      status: runtime.foreground,
      service: foregroundService,
      app: appForeground,
      titleOf: (chapterId) => chapterRepo.get(db, chapterId)?.title ?? null,
      now: () => Date.now(),
      timers: {
        set: (run, delayMs) => setTimeout(run, delayMs),
        clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    });
    return () => {
      runner.dispose();
    };
  }, [runtime, db, foregroundService, appForeground]);

  useEffect(() => {
    if (!runtime) return undefined;
    let busy = false;
    let awake = false;
    /** The screen is kept awake only while the chapters are prepared without the service. */
    const sync = () => {
      const wanted = busy && !runtime.foreground.keepsAlive();
      if (wanted && !awake) {
        awake = true;
        void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      } else if (!wanted && awake) {
        awake = false;
        void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
      }
    };
    const unsubscribeQueue = runtime.subscribeQueue((snapshot) => {
      busy = snapshot.running !== null || (snapshot.pending.length > 0 && !runtime.isPaused());
      sync();
    });
    const unsubscribeService = runtime.foreground.subscribe(sync);
    return () => {
      unsubscribeQueue();
      unsubscribeService();
      if (awake) void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [runtime]);

  useEffect(() => {
    if (!runtime) return undefined;
    let processing = false;
    let noticeDue = false;
    const unsubscribeQueue = runtime.subscribeQueue((snapshot) => {
      processing = snapshot.running !== null || snapshot.pending.length > 0;
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        const degraded = !runtime.foreground.keepsAlive();
        if (processing && degraded && !settingsStore.getSettings().backgroundNoticeShown) {
          noticeDue = true;
        }
        return;
      }
      if (noticeDue) {
        noticeDue = false;
        toast.show({ message: BACKGROUND_NOTICE, tone: 'neutral' });
        settingsStore.patch({ backgroundNoticeShown: true });
      }
    });
    return () => {
      unsubscribeQueue();
      subscription.remove();
    };
  }, [runtime, toast]);

  useEffect(() => {
    if (!runtime) return undefined;
    const primer = createNotificationPrimer({
      isGranted: () => permission.isGranted(),
      isForeground: () => appForeground.isActive(),
      wasShown: () => settingsStore.getSettings().notificationPromptShown,
      markShown: () => settingsStore.patch({ notificationPromptShown: true }),
      show: () => setPrimerOpen(true),
    });
    return runtime.subscribeQueue((snapshot) => {
      if (snapshot.running !== null || snapshot.pending.length > 0) primer.queued();
    });
  }, [runtime, permission, appForeground]);

  useEffect(() => {
    if (!runtime) return undefined;
    return runtime.subscribeEvents((event) => {
      if (event.type === 'done' && AppState.currentState === 'active') {
        const title = chapterRepo.get(db, event.chapterId)?.title;
        toast.show({
          message: title ? `Chapter ready: «${title}»` : 'Chapter ready',
          tone: 'success',
        });
      }
      if (event.type === 'error' && event.error.code === 'AUTH') {
        toast.show({
          message: 'Connect OpenRouter to keep processing your chapters.',
          tone: 'danger',
          action: {
            label: 'Connect OpenRouter',
            onPress: () => router.push(CONNECT_ROUTE),
          },
        });
      }
    });
  }, [runtime, db, toast, router]);

  useEffect(() => {
    if (runtime && keyStatus === 'present' && runtime.isPaused()) runtime.resume();
  }, [runtime, keyStatus]);

  useEffect(() => {
    if (!runtime) return undefined;
    return runtime.subscribeQueue((snapshot) => {
      setBusy(isQueueBusy(snapshot, runtime.isPaused()));
    });
  }, [runtime]);

  // The processing service keeps the app alive in the background while chapters process (ADR-0007).
  useEffect(() => {
    if (!runtime) return undefined;
    return new BackgroundWork({
      service: processingService,
      queue: {
        subscribe: runtime.subscribeQueue,
        isPaused: runtime.isPaused,
        retryNow: runtime.retryNow,
      },
      facade: runtime.facade,
      appState: {
        current: () => AppState.currentState,
        subscribe: (listener) => {
          const subscription = AppState.addEventListener('change', listener);
          return () => subscription.remove();
        },
      },
      titleOf: (chapterId) => chapterRepo.get(db, chapterId)?.title ?? APP_NAME,
      scheduler: TIMER_SCHEDULER,
      now: () => Date.now(),
    }).start();
  }, [runtime, db]);

  if (!runtime) return null;
  return (
    <>
      <WebViewHost />
      <NotificationPrompt busy={busy} />
    </>
  );
}
