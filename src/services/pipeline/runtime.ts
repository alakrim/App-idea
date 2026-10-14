/*
 * Composes the pipeline from its adapters: the ports (repos, OpenRouter, the WebView, the library
 * files) and the facade on top. Nothing here imports React or an Expo module, so the end-to-end test
 * runs the same composition the app does, with a fake network and an in-memory file store.
 */
import { createIdGenerator } from '@/core/domain';
import type { IdGenerator } from '@/core/domain';
import type { PipelineEvent } from '@/core/pipeline/context';
import type { Clock, DeviceStorage, PipelinePorts, WebViewExtractor } from '@/core/pipeline/ports';
import type { QueueSnapshot } from '@/core/pipeline/queue';
import { settingsRepo } from '@/db/repos/settings-repo';
import type { Db } from '@/db/types';
import type { PipelineFacade } from '@/features/pipeline/facade';
import { createConnection } from '@/services/network/connection';
import type { Connection } from '@/services/network/connection';
import type { OpenRouterClient } from '@/services/openrouter';

import { createAudioFiles } from './adapters/audio-files';
import { createCatalog } from './adapters/catalog';
import { createChapterStore } from './adapters/chapter-store';
import { createFetcher } from './adapters/fetcher';
import { createJobStore } from './adapters/job-store';
import { createLlmPort } from './adapters/llm-port';
import { createPdfTextSource } from './adapters/pdf-text-source';
import { createTts } from './adapters/tts';
import { createUsageLedger } from './adapters/usage-ledger';
import { createPipelineService } from './facade';
import { createForegroundStatus } from './foreground-status';

import type { ForegroundStatusStore } from './foreground-status';
import type { LibraryFiles } from './library-files';

export interface PipelineRuntimeOptions {
  readonly db: Db;
  readonly openrouter: OpenRouterClient;
  readonly files: LibraryFiles;
  readonly webview: WebViewExtractor;
  /** The device's free space, read before narration spends money. */
  readonly storage: DeviceStorage;
  /** The page fetcher's transport. Defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** The app's connection, shared with the OpenRouter client. Defaults to a private one. */
  readonly connection?: Connection;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  /** The foreground service's state. Defaults to a store on a platform without the service. */
  readonly foreground?: ForegroundStatusStore;
}

export interface PipelineRuntime {
  readonly facade: PipelineFacade;
  /** The background service's state. The background runner reports into it; Diagnostics reads it. */
  readonly foreground: ForegroundStatusStore;
  /** Re-enqueues the chapters persisted by an earlier session, with their options. Call once at boot. */
  restore(): Promise<void>;
  /** Runs the queue again after an AUTH pause, once a key is saved. */
  resume(): void;
  isPaused(): boolean;
  /** Resolves when the queue is empty and nothing is running. */
  idle(): Promise<void>;
  subscribeQueue(listener: (snapshot: QueueSnapshot) => void): () => void;
  subscribeEvents(listener: (event: PipelineEvent) => void): () => void;
  /** Called when the chapter queue first fails to save. Saving is retried on the next change. */
  subscribeSaveFailures(listener: () => void): () => void;
}

export function createPipelinePorts(options: PipelineRuntimeOptions): PipelinePorts {
  const clock: Clock = options.clock ?? { now: () => Date.now() };
  const ids = options.ids ?? createIdGenerator({ now: clock.now });
  const { db, files, openrouter } = options;
  const connection = options.connection ?? createConnection();
  const audio = createAudioFiles(files);
  return {
    chapters: createChapterStore({ db, clock, ids, files }),
    jobs: createJobStore({ db, clock }),
    ledger: createUsageLedger(db),
    fetcher: createFetcher({ fetchImpl: options.fetchImpl, connection }),
    webview: options.webview,
    pdf: createPdfTextSource({
      openrouter,
      files,
      parserModel: () => settingsRepo.getSettings(db).cleanupModel,
    }),
    tts: createTts({ openrouter }),
    audio,
    llm: createLlmPort({ openrouter }),
    network: connection,
    catalog: createCatalog({ openrouter }),
    storage: options.storage,
    clock,
    ids,
  };
}

export function createPipelineRuntime(options: PipelineRuntimeOptions): PipelineRuntime {
  const clock: Clock = options.clock ?? { now: () => Date.now() };
  const ids = options.ids ?? createIdGenerator({ now: clock.now });
  const ports = createPipelinePorts({ ...options, clock, ids });
  const foreground = options.foreground ?? createForegroundStatus(false);
  const service = createPipelineService({
    db: options.db,
    ports,
    fetcher: ports.fetcher,
    files: options.files,
    clock,
    ids,
    keepsAliveInBackground: () => foreground.keepsAlive(),
  });
  const { queue } = service;

  return {
    facade: service.facade,
    foreground,
    restore: () => queue.restore(),
    resume: () => queue.resume(),
    isPaused: () => queue.isPaused(),
    idle: () => queue.idle(),
    subscribeQueue: (listener) => queue.subscribe(listener),
    subscribeEvents: (listener) => service.subscribeEvents(listener),
    subscribeSaveFailures: (listener) => service.subscribeSaveFailures(listener),
  };
}
