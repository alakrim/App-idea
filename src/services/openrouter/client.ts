import { chatJson, chatRaw, chatText } from './chat';
import { validateKey } from './key';
import { createModelCatalog } from './models';
import { parsePdf } from './pdf';
import { synthesizeSpeech } from './speech';
import { createTransport } from './transport';
import { createConnection } from '../network/connection';

import type {
  ChatJsonInput,
  ChatJsonResult,
  ChatRawInput,
  ChatRawResult,
  ChatTextInput,
  ChatTextResult,
} from './chat';
import type { KeyCheck } from './key';
import type { ModelCatalog } from './models';
import type { PdfInput, PdfResult } from './pdf';
import type { SpeechInput, SpeechResult } from './speech';
import type { Connection } from '../network/connection';

export interface OpenRouterClientOptions {
  /** Returns the user's key, or null when none is saved. Called before every request. */
  getApiKey: () => Promise<string | null>;
  appUrl: string;
  appTitle: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Retries after the first attempt, for retryable errors only. */
  maxRetries?: number;
  /** Longest passage accepted by synthesizeSpeech. */
  maxSpeechChars?: number;
  modelCacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  /** The connection whose stale requests are retried at once. Defaults to a private one. */
  connection?: Pick<Connection, 'register'>;
}

export interface OpenRouterClient {
  models: ModelCatalog;
  validateKey(): Promise<KeyCheck>;
  chatJson<T>(input: ChatJsonInput<T>): Promise<ChatJsonResult<T>>;
  chatText(input: ChatTextInput): Promise<ChatTextResult>;
  chatRaw(input: ChatRawInput): Promise<ChatRawResult>;
  synthesizeSpeech(input: SpeechInput): Promise<SpeechResult>;
  parsePdf(input: PdfInput): Promise<PdfResult>;
}

const defaults = {
  baseUrl: 'https://openrouter.ai/api/v1',
  /** Chat and JSON calls. Analysis prompts run to about 5k tokens, so the old 60 s was too short. */
  timeoutMs: 120_000,
  maxRetries: 3,
  maxSpeechChars: 4_000,
  modelCacheTtlMs: 60 * 60 * 1000,
} as const;

export function createOpenRouterClient(options: OpenRouterClientOptions): OpenRouterClient {
  const now = options.now ?? Date.now;
  const transport = createTransport({
    getApiKey: options.getApiKey,
    fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
    baseUrl: options.baseUrl ?? defaults.baseUrl,
    appUrl: options.appUrl,
    appTitle: options.appTitle,
    timeoutMs: options.timeoutMs ?? defaults.timeoutMs,
    maxRetries: options.maxRetries ?? defaults.maxRetries,
    sleep: options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    random: options.random ?? Math.random,
    now,
    connection: options.connection ?? createConnection(),
  });
  const models = createModelCatalog({
    transport,
    ttlMs: options.modelCacheTtlMs ?? defaults.modelCacheTtlMs,
    now,
  });
  const chatDeps = { transport, models };

  return {
    models,
    validateKey: () => validateKey({ transport }),
    chatJson: (input) => chatJson(chatDeps, input),
    chatText: (input) => chatText(chatDeps, input),
    chatRaw: (input) => chatRaw(chatDeps, input),
    synthesizeSpeech: (input) =>
      synthesizeSpeech(
        { transport, maxChars: options.maxSpeechChars ?? defaults.maxSpeechChars },
        input,
      ),
    parsePdf: (input) => parsePdf(chatDeps, input),
  };
}
