import { z } from 'zod';

import { pipelineFailure } from './errors';
import { jsonBody } from './transport';

import type { PipelineFailure } from './errors';
import type { Transport } from './transport';

export type OutputModality = 'text' | 'speech' | 'embeddings';

export interface ListModelsOptions {
  outputModality?: OutputModality;
  signal?: AbortSignal;
}

/** USD per unit of the model's billing unit (per token, or per character for character-priced TTS). */
export interface ModelPricing {
  prompt: number;
  completion: number;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: ModelPricing;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  supportedVoices: string[];
}

export interface ModelCatalog {
  list(options?: ListModelsOptions): Promise<OpenRouterModel[]>;
}

interface ModelCatalogDeps {
  transport: Transport;
  ttlMs: number;
  now: () => number;
  /**
   * Returns the last saved snapshot, or null. Called once, on the first `list` call, so a client
   * that is built but never asked for models does no I/O. Never overrides a fetched entry.
   */
  loadSnapshot?: () => string | null;
  /**
   * Receives the snapshot after each successful network fetch, never after a cache hit. It must not
   * throw: a failed save costs one fetch on the next launch.
   */
  onFetched?: (snapshot: string) => void;
}

/** One network fetch per modality, shared by every caller that asks while it is in flight. */
interface Flight {
  readonly promise: Promise<OpenRouterModel[]>;
  readonly controller: AbortController;
  /** Callers still waiting. The request is aborted when the last one leaves. */
  waiters: number;
  settled: boolean;
}

const priceSchema = z
  .string()
  .regex(/^\d+(\.\d+)?(e-?\d+)?$/i)
  .transform((value) => Number(value));

/** Wire shape, trimmed to the fields we use. Unknown fields are stripped. */
const apiModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    context_length: z.number().nullish(),
    pricing: z.object({ prompt: priceSchema.optional(), completion: priceSchema.optional() }),
    architecture: z.object({
      input_modalities: z.array(z.string()),
      output_modalities: z.array(z.string()),
    }),
    supported_parameters: z.array(z.string()).nullish(),
    supported_voices: z.array(z.string()).nullish(),
  })
  .transform((model): OpenRouterModel => ({
    id: model.id,
    name: model.name,
    contextLength: model.context_length ?? 0,
    pricing: { prompt: model.pricing.prompt ?? 0, completion: model.pricing.completion ?? 0 },
    inputModalities: model.architecture.input_modalities,
    outputModalities: model.architecture.output_modalities,
    supportedParameters: model.supported_parameters ?? [],
    supportedVoices: model.supported_voices ?? [],
  }));

/** Camel-case shape used in memory and in persisted snapshots. */
const storedModelSchema: z.ZodType<OpenRouterModel> = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number(),
  pricing: z.object({ prompt: z.number(), completion: z.number() }),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  supportedParameters: z.array(z.string()),
  supportedVoices: z.array(z.string()),
});

const listResponseSchema = z.object({ data: z.array(z.unknown()) });

const snapshotSchema = z.object({
  version: z.literal(1),
  entries: z.array(
    z.object({
      outputModality: z.enum(['text', 'speech', 'embeddings']),
      fetchedAt: z.number(),
      models: z.array(storedModelSchema),
    }),
  ),
});

interface CacheEntry {
  fetchedAt: number;
  models: OpenRouterModel[];
}

export function createModelCatalog(deps: ModelCatalogDeps): ModelCatalog {
  const entries = new Map<OutputModality, CacheEntry>();
  const flights = new Map<OutputModality, Flight>();
  let restored = false;

  function restoreOnce(): void {
    if (restored) return;
    restored = true;
    const payload = deps.loadSnapshot?.() ?? null;
    if (payload === null) return;
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    const parsed = snapshotSchema.safeParse(json);
    if (!parsed.success) return;
    for (const entry of parsed.data.entries) {
      entries.set(entry.outputModality, { fetchedAt: entry.fetchedAt, models: entry.models });
    }
  }

  function serialize(): string {
    const snapshot = {
      version: 1,
      entries: Array.from(entries, ([outputModality, entry]) => ({
        outputModality,
        fetchedAt: entry.fetchedAt,
        models: entry.models,
      })),
    };
    return JSON.stringify(snapshot);
  }

  function startFlight(modality: OutputModality): Flight {
    const controller = new AbortController();
    const flight: Flight = {
      promise: fetchModels(modality, controller.signal),
      controller,
      waiters: 0,
      settled: false,
    };
    flights.set(modality, flight);
    const settle = (): void => {
      flight.settled = true;
      if (flights.get(modality) === flight) flights.delete(modality);
    };
    flight.promise.then(settle, settle);
    return flight;
  }

  async function fetchModels(
    modality: OutputModality,
    signal: AbortSignal,
  ): Promise<OpenRouterModel[]> {
    const response = await deps.transport.request(
      {
        method: 'GET',
        path: '/models',
        query: { output_modalities: modality },
        accept: 'application/json',
        signal,
      },
      jsonBody(listResponseSchema),
    );
    const models = parseModelItems(response.data);
    entries.set(modality, { fetchedAt: deps.now(), models });
    deps.onFetched?.(serialize());
    return models;
  }

  /**
   * Joins the modality's request in flight, or starts one. A caller that aborts stops waiting at
   * once. The request itself is aborted only when its last waiter has left.
   */
  function join(
    modality: OutputModality,
    signal: AbortSignal | undefined,
  ): Promise<OpenRouterModel[]> {
    if (signal?.aborted) return Promise.reject(cancelledFailure());
    const flight = flights.get(modality) ?? startFlight(modality);
    flight.waiters += 1;
    const leave = (): void => {
      flight.waiters -= 1;
      if (flight.waiters > 0 || flight.settled) return;
      if (flights.get(modality) === flight) flights.delete(modality);
      flight.controller.abort();
    };
    return waitFor(flight.promise, signal).finally(leave);
  }

  return {
    async list(options = {}) {
      const modality = options.outputModality ?? 'text';
      restoreOnce();
      const cached = entries.get(modality);
      if (cached && deps.now() - cached.fetchedAt < deps.ttlMs) return cached.models;
      return join(modality, options.signal);
    },
  };
}

function cancelledFailure(): PipelineFailure {
  return pipelineFailure('CANCELLED', 'Cancelled.', { retryable: false });
}

/** Settles with `work`, or rejects as a cancelled request as soon as `signal` aborts. */
function waitFor<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(cancelledFailure());
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

/** Keeps the models that pass validation. One malformed entry must not hide the rest. */
function parseModelItems(items: unknown[]): OpenRouterModel[] {
  const models: OpenRouterModel[] = [];
  for (const item of items) {
    const parsed = apiModelSchema.safeParse(item);
    if (parsed.success) models.push(parsed.data);
  }
  return models;
}

export function supportsStructuredOutput(
  model: Pick<OpenRouterModel, 'supportedParameters'>,
): boolean {
  return model.supportedParameters.includes('structured_outputs');
}
