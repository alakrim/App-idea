import { z } from 'zod';

import { pipelineFailure } from './errors';
import { jsonBody } from './transport';

import type { PipelineFailure } from './errors';
import type { Transport } from './transport';

export type OutputModality = 'text' | 'speech' | 'embeddings';

export interface ListModelsOptions {
  outputModality?: OutputModality;
  /** Asks OpenRouter now, even when a copy is cached. The cache is still refreshed with the reply. */
  fresh?: boolean;
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
  /** When OpenRouter added the model, in epoch milliseconds. Null when the catalogue has no date. */
  createdAt: number | null;
}

export interface ModelCatalog {
  list(options?: ListModelsOptions): Promise<OpenRouterModel[]>;
  /** Snapshot of the cache as a JSON string, for the app to persist. */
  serialize(): string;
  /** Restores a snapshot. Returns false (and changes nothing) when the payload is invalid. */
  hydrate(payload: string): boolean;
}

/**
 * How long a cached list is served without asking again. Speech lists move faster (new voice
 * models appear every few days), so they expire after 10 minutes; text lists after an hour.
 */
export const CATALOG_TTL_MS: Readonly<Record<OutputModality, number>> = {
  text: 60 * 60 * 1000,
  speech: 10 * 60 * 1000,
  embeddings: 60 * 60 * 1000,
};

interface ModelCatalogDeps {
  transport: Transport;
  ttlMs: Readonly<Record<OutputModality, number>>;
  now: () => number;
}

const priceSchema = z
  .string()
  .regex(/^\d+(\.\d+)?(e-?\d+)?$/i)
  .transform((value) => Number(value));

/** OpenRouter sends `created` in unix seconds. A missing or non-numeric value reads as no date. */
function createdAtFromSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : null;
}

/** Wire shape, trimmed to the fields we use. Unknown fields are stripped. */
const apiModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    context_length: z.number().nullish(),
    created: z.unknown().optional(),
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
    createdAt: createdAtFromSeconds(model.created),
  }));

/** Camel-case shape used in memory and in persisted snapshots. Snapshots from before `createdAt`
 * existed read it as no date, so they stay usable. */
const storedModelSchema: z.ZodType<OpenRouterModel> = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number(),
  pricing: z.object({ prompt: z.number(), completion: z.number() }),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  supportedParameters: z.array(z.string()),
  supportedVoices: z.array(z.string()),
  createdAt: z.number().nullable().default(null),
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

/** One network request for a modality, shared by every caller that asks while it is in flight. */
interface Flight {
  readonly promise: Promise<OpenRouterModel[]>;
  readonly controller: AbortController;
  /** Callers still waiting. The request is aborted when the last one leaves. */
  waiters: number;
  settled: boolean;
}

export function createModelCatalog(deps: ModelCatalogDeps): ModelCatalog {
  const entries = new Map<OutputModality, CacheEntry>();
  const flights = new Map<OutputModality, Flight>();

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
      const cached = entries.get(modality);
      const withinTtl =
        cached !== undefined && deps.now() - cached.fetchedAt < deps.ttlMs[modality];
      if (cached && withinTtl && options.fresh !== true) return cached.models;
      return join(modality, options.signal);
    },

    serialize() {
      const snapshot = {
        version: 1,
        entries: Array.from(entries, ([outputModality, entry]) => ({
          outputModality,
          fetchedAt: entry.fetchedAt,
          models: entry.models,
        })),
      };
      return JSON.stringify(snapshot);
    },

    hydrate(payload) {
      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        return false;
      }
      const parsed = snapshotSchema.safeParse(json);
      if (!parsed.success) return false;
      for (const entry of parsed.data.entries) {
        entries.set(entry.outputModality, { fetchedAt: entry.fetchedAt, models: entry.models });
      }
      return true;
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
export function parseModelItems(items: unknown[]): OpenRouterModel[] {
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

export function voicesFor(model: Pick<OpenRouterModel, 'supportedVoices'>): string[] {
  return model.supportedVoices;
}
