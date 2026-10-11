/*
 * Catalog: the live OpenRouter catalog (text and speech models) as the pipeline prices them. The
 * catalog is cached by the client, so repeated lookups are cheap. A catalog that cannot be read is
 * treated as empty: the cost meter then records 0 for that call, and the estimate reads as unknown.
 *
 * Style heuristic: a model supports the `instructions` (style) field when its id contains both
 * `gemini` and `tts`, or when its supported parameters list `instructions`. Any other model gets a
 * narration with no style, so the core clears it before the call.
 */
import type { Catalog, CatalogModel } from '@/core/pipeline/ports';
import type { OpenRouterClient, OpenRouterModel } from '@/services/openrouter';

export interface CatalogDeps {
  readonly openrouter: Pick<OpenRouterClient, 'models'>;
}

export function supportsStyle(model: Pick<OpenRouterModel, 'id' | 'supportedParameters'>): boolean {
  const id = model.id.toLowerCase();
  if (id.includes('gemini') && id.includes('tts')) return true;
  return model.supportedParameters.includes('instructions');
}

function toCatalogModel(model: OpenRouterModel): CatalogModel {
  return {
    id: model.id,
    pricing: { prompt: model.pricing.prompt, completion: model.pricing.completion },
    supportsStyle: supportsStyle(model),
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
