import { useCallback, useRef, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import type { BridgeDeps } from './checks-webview';

/** A page that posts `chars` characters back to native once it has loaded. */
export function bridgeHtml(chars: number): string {
  return `<!doctype html><html><body><script>window.ReactNativeWebView.postMessage('x'.repeat(${chars}));</script></body></html>`;
}

interface Pending {
  id: number;
  chars: number;
  resolve: (received: number) => void;
  reject: (error: Error) => void;
}

/**
 * A hidden WebView for the bridge size probe. `send(chars)` loads a page that posts that many
 * characters back, and resolves with the length native received. Render `host` once in the screen.
 */
export function useBridgeProbe(): BridgeDeps & { host: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null);
  const counter = useRef(0);

  const send = useCallback(
    (chars: number) =>
      new Promise<number>((resolve, reject) => {
        counter.current += 1;
        setPending({ id: counter.current, chars, resolve, reject });
      }),
    [],
  );

  const settle = (request: Pending, outcome: () => void) => {
    setPending((current) => (current?.id === request.id ? null : current));
    outcome();
  };

  const host = pending ? (
    <WebView
      key={pending.id}
      source={{ html: bridgeHtml(pending.chars) }}
      javaScriptEnabled
      originWhitelist={['*']}
      onMessage={(event: WebViewMessageEvent) =>
        settle(pending, () => pending.resolve(event.nativeEvent.data.length))
      }
      onError={() =>
        settle(pending, () => pending.reject(new Error('The bridge page failed to load.')))
      }
      style={styles.offscreen}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  ) : null;

  return { send, host };
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
