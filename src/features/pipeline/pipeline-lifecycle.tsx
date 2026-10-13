/*
 * The app-side life of the pipeline, mounted once under the toasts. It resumes the persisted queue
 * at boot, keeps the screen awake while chapters are processing, toasts a finished chapter when the
 * app is in the foreground, and offers "Connect OpenRouter" when a missing key pauses the queue. It
 * resumes the queue once a key is saved. It also hosts the hidden WebView used for JS-rendered pages.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { settingsStore } from '@/features/settings/settings-store';
import { WebViewHost } from '@/services/pipeline/webview-host';
import { useApiKeyStatus } from '@/services/secrets';
import { useToast } from '@/ui/toast';

import { usePipelineRuntime } from './pipeline-provider';

export const KEEP_AWAKE_TAG = 'lectio-pipeline';
export const CONNECT_ROUTE = '/settings/api-key';
/** Shown once, the first time the user leaves the app while a chapter is being prepared. */
export const BACKGROUND_NOTICE =
  'Lectio pauses chapter preparation while it\'s in the background. Keep it open to finish faster.';

export function PipelineLifecycle() {
  const runtime = usePipelineRuntime();
  const toast = useToast();
  const router = useRouter();
  const keyStatus = useApiKeyStatus();
  const restored = useRef(false);

  useEffect(() => {
    if (!runtime || restored.current) return;
    restored.current = true;
    void runtime.restore().catch(() => undefined);
  }, [runtime]);

  useEffect(() => {
    if (!runtime) return undefined;
    let awake = false;
    const unsubscribe = runtime.subscribeQueue((snapshot) => {
      const busy =
        snapshot.running !== null || (snapshot.pending.length > 0 && !runtime.isPaused());
      if (busy && !awake) {
        awake = true;
        void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      } else if (!busy && awake) {
        awake = false;
        void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
      }
    });
    return () => {
      unsubscribe();
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
        if (processing && !settingsStore.getSettings().backgroundNoticeShown) noticeDue = true;
        return;
      }
      if (noticeDue && !settingsStore.getSettings().backgroundNoticeShown) {
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
    return runtime.subscribeEvents((event) => {
      if (event.type === 'done' && AppState.currentState === 'active') {
        toast.show({ message: 'Chapter ready', tone: 'success' });
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
  }, [runtime, toast, router]);

  useEffect(() => {
    if (runtime && keyStatus === 'present' && runtime.isPaused()) runtime.resume();
  }, [runtime, keyStatus]);

  return runtime ? <WebViewHost /> : null;
}
