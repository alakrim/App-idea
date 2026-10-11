import { z } from 'zod';

import { jsonBody } from './transport';

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
  /** Snapshot of the cache as a JSON string, for the app to persist. */
  serialize(): string;
  /** Restores a snapshot. Returns false (and changes nothing) when the payload is invalid. */
  hydrate(payload: string): boolean;
}

interface ModelCatalogDeps {
  transport: Transport;
  ttlMs: number;
  now: () => number;
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

  return {
    async list(options = {}) {
      const modality = options.outputModality ?? 'text';
      const cached = entries.get(modality);
      if (cached && deps.now() - cached.fetchedAt < deps.ttlMs) return cached.models;

      const response = await deps.transport.request(
        {
          method: 'GET',
          path: '/models',
          query: { output_modalities: modality },
          accept: 'application/json',
          signal: options.signal,
        },
        jsonBody(listResponseSchema),
      );
      const models = parseModelItems(response.data);
      entries.set(modality, { fetchedAt: deps.now(), models });
      return models;
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

export function voicesFor(model: Pick<OpenRouterModel, 'supportedVoices'>): string[] {
  return model.supportedVoices;
}
