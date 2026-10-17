import type { OpenRouterModel } from '@/services/openrouter';

/** A model added to OpenRouter this recently is badged "New". */
export const NEW_MODEL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * True for a model created less than 30 days before `now`. The clock is a parameter so the window
 * is testable at its edges. A model with no date is never new. A date ahead of `now` (a phone with
 * a slow clock) still counts as new.
 */
export function isNewModel(model: Pick<OpenRouterModel, 'createdAt'>, now: number): boolean {
  return model.createdAt !== null && now - model.createdAt < NEW_MODEL_WINDOW_MS;
}
