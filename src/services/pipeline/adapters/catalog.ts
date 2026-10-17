/*
 * Catalog: the live OpenRouter catalog (text and speech models) as the pipeline prices them. The
 * catalog is cached by the client, so repeated lookups are cheap. A catalog that cannot be read is
 * treated as empty: the cost meter then records 0 for that call, and the estimate reads as unknown.
 *
 * Style support comes from the shared rule in core/narration/capabilities, so the settings screens
 * and the pipeline agree. A model without it gets a narration with no style, cleared before the call.
 */
import { supportsStyleInstructions } from '@/core/narration/capabilities';
import type { Catalog, CatalogModel } from '@/core/pipeline/ports';
import type { OpenRouterClient, OpenRouterModel } from '@/services/openrouter';

export interface CatalogDeps {
  readonly openrouter: Pick<OpenRouterClient, 'models'>;
}

function toCatalogModel(model: OpenRouterModel): CatalogModel {
  return {
    id: model.id,
    pricing: { prompt: model.pricing.prompt, completion: model.pricing.completion },
    supportsStyle: supportsStyleInstructions(model),
  };
}

export function createCatalog({ openrouter }: CatalogDeps): Catalog {
  const listOf = async (outputModality: 'text' | 'speech'): Promise<OpenRouterModel[]> => {
    try {
      return await openrouter.models.list({ outputModality });
    } catch {
      return [];
    }
  };
  return {
    async find(modelId) {
      const [text, speech] = await Promise.all([listOf('text'), listOf('speech')]);
      const match = [...text, ...speech].find((model) => model.id === modelId);
      return match ? toCatalogModel(match) : null;
    },
  };
}
