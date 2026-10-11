/*
 * The hidden WebView host. Mounted once in the app shell. It renders the page of the current render
 * request offscreen, with JavaScript on and nothing else allowed: no files, no third-party cookies,
 * no incognito leaks, http and https only, and a single message back (the page's HTML).
 */
import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { webViewRenderQueue } from './webview-bridge';
import { RENDER_SCRIPT } from './webview-script';

import type { ActiveRender } from './webview-queue';

const ORIGIN_WHITELIST = ['https://*', 'http://*'];

const subscribe = (listener: () => void) => webViewRenderQueue.subscribe(listener);
const currentRender = (): ActiveRender | null => webViewRenderQueue.current();

export function WebViewHost() {
  const active = useSyncExternalStore(subscribe, currentRender, currentRender);
  if (active === null) return null;

  return (
    <WebView
      key={active.id}
      source={{ uri: active.url }}
      originWhitelist={ORIGIN_WHITELIST}
      javaScriptEnabled
      domStorageEnabled={false}
      incognito
      thirdPartyCookiesEnabled={false}
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      injectedJavaScript={RENDER_SCRIPT}
      onMessage={(event: WebViewMessageEvent) =>
        webViewRenderQueue.complete(active.id, event.nativeEvent.data)
      }
      onError={() => webViewRenderQueue.fail(active.id, 'load')}
      onHttpError={() => webViewRenderQueue.fail(active.id, 'http')}
      style={styles.offscreen}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
