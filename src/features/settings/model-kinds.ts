import { DEFAULT_MODELS, DEFAULT_NARRATION } from '@/core/defaults';
import type { Settings, SettingsPatch } from '@/core/settings';
import type { OpenRouterModel, OutputModality } from '@/services/openrouter';
import { supportsStructuredOutput } from '@/services/openrouter';

import { formatContext, formatHourlyCost, formatPerMillion } from './format';
import { hourlyNarrationCost, narrationForModel, narratableModels } from './voice-tiers';

/**
 * The model pickers the app offers. One route serves all of them, selected by `kind`, so each
 * picker is only a filter, a summary line and a settings patch.
 */

export const MODEL_KINDS = ['translation', 'analysis', 'cleanup', 'narration'] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

export function parseModelKind(raw: string | undefined): ModelKind | null {
  return MODEL_KINDS.find((kind) => kind === raw) ?? null;
}

export interface ModelKindConfig {
  title: string;
  searchLabel: string;
  modality: OutputModality;
  /** Keeps the models this picker can use. */
  accept: (model: OpenRouterModel) => boolean;
  selectedId: string;
  recommendedId: string;
  describe: (model: OpenRouterModel) => string;
  /** The settings change that picking `model` makes. */
  patchFor: (model: OpenRouterModel) => SettingsPatch;
}

function isTextModel(model: OpenRouterModel): boolean {
  return model.outputModalities.includes('text');
}

/** Text output, plus structured JSON output because the pipeline validates JSON against schemas. */
function isStructuredTextModel(model: OpenRouterModel): boolean {
  return isTextModel(model) && supportsStructuredOutput(model);
}

function describeText(model: OpenRouterModel): string {
  return `${formatContext(model.contextLength)} context · ${formatPerMillion(model.pricing.prompt)} in · ${formatPerMillion(model.pricing.completion)} out per 1M`;
}

function describeSpeech(model: OpenRouterModel): string {
  const voices = model.supportedVoices.length;
  return `${voices} voices · ${formatHourlyCost(hourlyNarrationCost(model))} of narration`;
}

export function modelKindConfig(kind: ModelKind, settings: Settings): ModelKindConfig {
  switch (kind) {
    case 'translation':
      return {
        title: 'Translation model',
        searchLabel: 'Search translation models',
        modality: 'text',
        accept: isStructuredTextModel,
        selectedId: settings.translationModel,
        recommendedId: DEFAULT_MODELS.translation,
        describe: describeText,
        patchFor: (model) => ({ translationModel: model.id }),
      };
    case 'analysis':
      return {
        title: 'Analysis model',
        searchLabel: 'Search analysis models',
        modality: 'text',
        accept: isStructuredTextModel,
        selectedId: settings.analysisModel,
        recommendedId: DEFAULT_MODELS.analysis,
        describe: describeText,
        patchFor: (model) => ({ analysisModel: model.id }),
      };
    case 'cleanup':
      return {
        title: 'Cleanup model',
        searchLabel: 'Search cleanup models',
        modality: 'text',
        accept: isStructuredTextModel,
        selectedId: settings.cleanupModel,
        recommendedId: DEFAULT_MODELS.cleanup,
        describe: describeText,
        patchFor: (model) => ({ cleanupModel: model.id }),
      };
    case 'narration':
      return {
        title: 'Narration model',
        searchLabel: 'Search narration models',
        modality: 'speech',
        accept: (model) => narratableModels([model]).length > 0,
        selectedId: settings.narration.model,
        recommendedId: DEFAULT_NARRATION.model,
        describe: describeSpeech,
        patchFor: (model) => ({ narration: narrationForModel(settings.narration, model) }),
      };
  }
}
