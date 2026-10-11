import { modelLabel, providerLabel } from './format';

import type { OpenRouterModel } from '@/services/openrouter';

/**
 * Every word of the query must appear in the model's name, id, provider or short label. Matching
 * is case-insensitive, so "haiku" and "Anthropic claude" both work.
 */
export function filterModels(
  models: readonly OpenRouterModel[],
  query: string,
): readonly OpenRouterModel[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return models;
  return models.filter((model) => {
    const haystack = [model.id, model.name, providerLabel(model.id), modelLabel(model.id)]
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Strips the "Provider: " prefix OpenRouter puts on display names. */
export function displayName(model: Pick<OpenRouterModel, 'id' | 'name'>): string {
  const separator = model.name.indexOf(': ');
  const stripped = separator === -1 ? model.name : model.name.slice(separator + 2);
  return stripped.trim() === '' ? modelLabel(model.id) : stripped;
}
