/*
 * The one render queue the app's hidden WebView serves. The WebView extractor (the pipeline's port)
 * enqueues here, and the mounted host renders the current request. Kept apart from the React host so
 * the pipeline can be composed in Node tests without loading react-native-webview.
 */
import { WebViewRenderQueue } from './webview-queue';

export const webViewRenderQueue = new WebViewRenderQueue();
