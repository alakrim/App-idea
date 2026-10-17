/*
 * The app's pipeline: the real runtime on the app's database, OpenRouter client, library files and
 * hidden WebView. Feature code reaches it through PipelineProvider, never through this module.
 */
import { Platform } from 'react-native';

import { getOpenRouter } from '@/app-shell/openrouter-provider';
import { getDatabase } from '@/db/client';
import type { Db } from '@/db/types';
import { getAppConnection } from '@/services/network/app-connection';

import { createExpoLibraryFiles } from './expo-library-files';
import { createForegroundStatus } from './foreground-status';
import { createPipelineRuntime } from './runtime';
import { webViewRenderQueue } from './webview-bridge';

import type { PipelineRuntime } from './runtime';

export type { PipelineRuntime } from './runtime';

export function createLectioPipelineRuntime(db: Db = getDatabase()): PipelineRuntime {
  return createPipelineRuntime({
    db,
    openrouter: getOpenRouter(),
    files: createExpoLibraryFiles(),
    webview: { render: (url, signal) => webViewRenderQueue.render(url, signal) },
    connection: getAppConnection(),
    foreground: createForegroundStatus(Platform.OS === 'android'),
  });
}
