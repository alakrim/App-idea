import { useEffect, useState } from 'react';
import { z } from 'zod';

import { readCatalogSnapshot } from '@/services/catalog-cache';
import { PipelineFailure } from '@/services/openrouter';
import type { OpenRouterClient, OpenRouterModel, OutputModality } from '@/services/openrouter';

/**
 * The live model catalog for a picker, with the saved snapshot as the offline fallback. The
 * snapshot is written by the app's catalog wrapper on every successful fetch, so it is at most as
 * old as the user's last online visit.
 */

export type CatalogState =
  | { status: 'loading' }
  | { status: 'live'; models: readonly OpenRouterModel[] }
  | { status: 'cached'; models: readonly OpenRouterModel[]; savedAt: number }
  | { status: 'unavailable'; message: string };

const storedModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number(),
  pricing: z.object({ prompt: z.number(), completion: z.number() }),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  supportedParameters: z.array(z.string()),
  supportedVoices: z.array(z.string()),
  // Snapshots written before the catalogue date was kept read as no date.
  createdAt: z.number().nullable().default(null),
});

const snapshotSchema = z.object({
  version: z.literal(1),
  entries: z.array(
    z.object({
      outputModality: z.string(),
      fetchedAt: z.number(),
      models: z.array(storedModelSchema),
    }),
  ),
});

export interface CachedCatalog {
  models: readonly OpenRouterModel[];
  savedAt: number;
}

/**
 * Reads the saved snapshot for one modality. Anything malformed counts as no cache, because the
 * catalog is a speed-up and the picker can always ask again.
 */
export function readCachedCatalog(
  modality: OutputModality,
  read: () => string | null = readCatalogSnapshot,
): CachedCatalog | null {
  const payload = read();
  if (payload === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return null;
  }
  const parsed = snapshotSchema.safeParse(json);
  if (!parsed.success) return null;
  const entry = parsed.data.entries.find((candidate) => candidate.outputModality === modality);
  if (!entry || entry.models.length === 0) return null;
  return { models: entry.models, savedAt: entry.fetchedAt };
}

export function catalogFailureMessage(error: unknown): string {
  if (error instanceof PipelineFailure) return error.error.message;
  return 'The model list could not be loaded. Check your connection and try again.';
}

/** True once a catalog is on hand, live or from the saved snapshot. */
export function isLoaded(state: CatalogState): boolean {
  return state.status === 'live' || state.status === 'cached';
}

interface SettledCatalog {
  attempt: number;
  modality: OutputModality;
  state: CatalogState;
}

/**
 * Loads the catalog for one modality, falling back to the saved snapshot when the request fails.
 * Every mount asks OpenRouter at once. A reload keeps the models on screen and reports
 * `refreshing` until the reply lands, so a pull-to-refresh does not blank the list.
 */
export function useModelCatalog(
  client: OpenRouterClient,
  outputModality: OutputModality,
  readCache: (modality: OutputModality) => CachedCatalog | null = readCachedCatalog,
): { state: CatalogState; refreshing: boolean; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SettledCatalog | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const finish = (state: CatalogState) => {
      if (active) setSettled({ attempt, modality: outputModality, state });
    };

    client.models
      .list({ outputModality, fresh: true, signal: controller.signal })
      .then((models) => finish({ status: 'live', models }))
      .catch((error: unknown) => {
        const cached = readCache(outputModality);
        finish(
          cached
            ? { status: 'cached', models: cached.models, savedAt: cached.savedAt }
            : { status: 'unavailable', message: catalogFailureMessage(error) },
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [client, outputModality, readCache, attempt]);

  const latest = settled !== null && settled.modality === outputModality ? settled : null;
  // The last loaded list stays on screen while a reload is in flight. Anything else is loading.
  const previous = latest !== null && isLoaded(latest.state) ? latest.state : null;
  const answered = latest !== null && latest.attempt === attempt;
  return {
    state: latest !== null && answered ? latest.state : (previous ?? LOADING),
    refreshing: !answered && previous !== null,
    reload: () => setAttempt((value) => value + 1),
  };
}

const LOADING: CatalogState = { status: 'loading' };

/**
 * True when a catalog has loaded and does not offer `modelId`. The saved model then needs a
 * replacement. Unloaded or offline-without-cache states never count as missing.
 */
export function isModelMissing(state: CatalogState, modelId: string): boolean {
  if (state.status !== 'live' && state.status !== 'cached') return false;
  return !state.models.some((model) => model.id === modelId);
}
