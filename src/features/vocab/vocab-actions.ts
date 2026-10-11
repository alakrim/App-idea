import { createContext, useContext } from 'react';

import type { IdGenerator, Lang } from '@/core/domain';
import {
  buildVocabPrompt,
  VOCAB_JSON_SCHEMA_NAME,
  VocabExplanationSchema,
} from '@/core/vocab/prompts';
import type { Settings } from '@/core/settings';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import { usageRepo } from '@/db/repos/usage-repo';
import { vocabRepo } from '@/db/repos/vocab-repo';
import type { Db } from '@/db/types';
import type { OpenRouterClient } from '@/services/openrouter';
import { PipelineFailure } from '@/services/openrouter/errors';

/** Longest term kept. A whole sentence saved with no selection is cut to this. */
export const MAX_TERM_LENGTH = 120;
const EXPLAIN_TEMPERATURE = 0.2;
const EXPLAIN_MAX_TOKENS = 300;
const FALLBACK_FAILURE = 'Could not get an explanation. Try again.';
/** Used only when a series has no language at all, so the item is still saved. */
const UNKNOWN_LANG: Lang = 'und';

export interface SaveToVocabInput {
  seriesId: string;
  chapterId: string;
  sentenceIdx: number;
  /** The sentence the learner tapped. It gives the explanation its context. */
  text: string;
  /** The word or phrase the learner selected. Without one, the sentence is saved. */
  selection?: string | null;
}

/**
 * Save and explain. `saveToVocab` writes the item at once and returns its id, then fetches the
 * explanation in the background. A failed fetch keeps the item and records a message, and
 * `retryExplanation` tries again. The listeners fire on every change, so the UI can re-render.
 */
export interface VocabActions {
  saveToVocab(input: SaveToVocabInput): string;
  retryExplanation(id: string): void;
  isPending(id: string): boolean;
  failureOf(id: string): string | null;
  /** Changes whenever a pending state or failure changes. Suits useSyncExternalStore. */
  getVersion(): number;
  subscribe(listener: () => void): () => void;
}

export interface VocabActionsDeps {
  db: Db;
  openrouter: Pick<OpenRouterClient, 'chatJson'>;
  getSettings: () => Settings;
  now: () => number;
  newId: IdGenerator;
}

export function createVocabActions(deps: VocabActionsDeps): VocabActions {
  const { db, openrouter, getSettings, now, newId } = deps;
  const pending = new Set<string>();
  const failures = new Map<string, string>();
  const listeners = new Set<() => void>();
  let version = 0;

  const changed = (): void => {
    version += 1;
    for (const listener of listeners) listener();
  };

  const explain = (id: string, sentence: string): void => {
    if (pending.has(id)) return;
    const item = vocabRepo.get(db, id);
    if (item === null) return;

    pending.add(id);
    failures.delete(id);
    changed();

    const settings = getSettings();
    const prompt = buildVocabPrompt({
      term: item.term,
      sentence,
      studiedLang: item.lang,
      explainLang: settings.uiLanguage,
    });
    openrouter
      .chatJson({
        model: settings.analysisModel,
        system: prompt.system,
        user: prompt.user,
        schema: VocabExplanationSchema,
        jsonSchemaName: VOCAB_JSON_SCHEMA_NAME,
        temperature: EXPLAIN_TEMPERATURE,
        maxTokens: EXPLAIN_MAX_TOKENS,
      })
      .then(({ data, usage, model, generationId }) => {
        vocabRepo.setExplanation(db, id, {
          translation: data.translation,
          explanation: data.explanation,
        });
        usageRepo.insert(db, {
          id: newId(),
          at: now(),
          chapterId: item.chapterId,
          stage: 'vocab',
          model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          audioSeconds: null,
          costUsd: usage.costUsd ?? 0,
          generationId,
        });
      })
      .catch((error: unknown) => {
        failures.set(id, error instanceof PipelineFailure ? error.error.message : FALLBACK_FAILURE);
      })
      .finally(() => {
        pending.delete(id);
        changed();
      });
  };

  return {
    saveToVocab(input) {
      const selected = input.selection?.trim() ?? '';
      const term = [...(selected || input.text.trim())].slice(0, MAX_TERM_LENGTH).join('');
      if (term === '') throw new Error('Select a word or phrase to save.');

      const duplicate = vocabRepo
        .list(db, { seriesId: input.seriesId })
        .find(
          (item) =>
            item.chapterId === input.chapterId &&
            item.sentenceIdx === input.sentenceIdx &&
            item.term === term,
        );
      if (duplicate) return duplicate.id;

      const series = seriesRepo.get(db, input.seriesId);
      const chapter = chapterRepo.get(db, input.chapterId);
      const lang = series?.targetLang ?? series?.sourceLang ?? chapter?.sourceLang ?? UNKNOWN_LANG;

      const id = newId();
      vocabRepo.insert(db, {
        id,
        seriesId: input.seriesId,
        chapterId: input.chapterId,
        sentenceIdx: input.sentenceIdx,
        term,
        lang,
        createdAt: now(),
      });
      changed();
      explain(id, input.text);
      return id;
    },

    retryExplanation(id) {
      const item = vocabRepo.get(db, id);
      if (item === null) return;
      const sentence =
        textRepo.getRange(db, item.chapterId, item.sentenceIdx, item.sentenceIdx)[0]?.text ??
        item.term;
      explain(id, sentence);
    },

    isPending: (id) => pending.has(id),
    failureOf: (id) => failures.get(id) ?? null,
    getVersion: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const VocabActionsContext = createContext<VocabActions | null>(null);

/** The vocab actions for the subtree. The player and the chapter view call this too. */
export function useVocabActions(): VocabActions {
  const actions = useContext(VocabActionsContext);
  if (actions === null) {
    throw new Error('useVocabActions() must be used inside <VocabActionsProvider>.');
  }
  return actions;
}
