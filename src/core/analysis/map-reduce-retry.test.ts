/*
 * A retry after a failed chunk does not buy the finished chunks again (QA-F F-02). Each finished
 * chunk reply is checkpointed by its prompt and model, so the retry calls the model only for the
 * chunk that failed.
 */
import { sentences } from './__fixtures__/builders';
import { analyzeChapter } from './map-reduce';
import { reply as replyWith } from '../llm/__fixtures__/replies';

import type { AnalysisCallResult } from './analysis-call';
import type { AnalysisCheckpoints, AnalyzeChapterInput } from './map-reduce';
import type { LlmTransport } from '../llm/transport';

const memoryJson = (summary: string): string => JSON.stringify({ memory: { summary }, cues: [] });

/** An in-memory checkpoint store, the same contract the chapter store gives the analyze stage. */
function memoryCheckpoints(scope = 'model-a|v1'): {
  checkpoints: AnalysisCheckpoints;
  saved: Map<string, AnalysisCallResult>;
} {
  const saved = new Map<string, AnalysisCallResult>();
  return {
    saved,
    checkpoints: {
      scope,
      load: async (key) => saved.get(key) ?? null,
      save: async (key, result) => {
        saved.set(key, result);
      },
    },
  };
}

/** Two chunks, run one after another, so the transport's second call is chunk two. */
function twoChunkInput(
  transport: LlmTransport,
  checkpoints?: AnalysisCheckpoints,
): AnalyzeChapterInput {
  return {
    seriesTitle: 'Series',
    chapterTitle: 'Chapter 4',
    lang: 'en',
    priorContext: '',
    wordCount: 100,
    sentences: sentences(2, 100),
    planChunks: (all) => [all.slice(0, 1), all.slice(1)],
    concurrency: 1,
    reduceSummary: false,
    callLlm: transport,
    ...(checkpoints === undefined ? {} : { checkpoints }),
  };
}

/** A transport whose second call fails once, the way a dropped connection does. */
function failingSecondCall(): { transport: LlmTransport; calls: () => number } {
  let calls = 0;
  const transport: LlmTransport = async () => {
    calls += 1;
    if (calls === 2) throw new Error('connection reset');
    return replyWith(memoryJson('Part.'));
  };
  return { transport, calls: () => calls };
}

describe('QA-F F-02: analysis retry re-buys finished chunks', () => {
  it('a retry after chunk two fails does not call the model for chunk one again', async () => {
    const { transport, calls } = failingSecondCall();
    const input = twoChunkInput(transport, memoryCheckpoints().checkpoints);

    await expect(analyzeChapter(input)).rejects.toThrow('connection reset');
    await analyzeChapter(input);

    // Run one: chunk one, then chunk two (fails). Run two makes one call, for chunk two.
    expect(calls()).toBe(3);
  });

  it('never reuses a checkpoint written under another model or prompt scope', async () => {
    const { transport, calls } = failingSecondCall();
    const first = memoryCheckpoints('model-a|v1');
    const second = memoryCheckpoints('model-b|v1');
    await expect(analyzeChapter(twoChunkInput(transport, first.checkpoints))).rejects.toThrow();
    await analyzeChapter(twoChunkInput(transport, second.checkpoints));

    // Run one made two calls. Run two has another scope, so it makes both calls again.
    expect(calls()).toBe(4);
  });

  it('a retry that reuses a checkpoint reports only the usage it spent', async () => {
    const { transport } = failingSecondCall();
    const input = twoChunkInput(transport, memoryCheckpoints().checkpoints);
    await expect(analyzeChapter(input)).rejects.toThrow();

    const retry = await analyzeChapter(input);

    // One paid call in the retry (chunk two), so one call's worth of tokens, not two.
    expect(retry.usage.promptTokens).toBe(replyWith(memoryJson('Part.')).usage.promptTokens);
  });
});
