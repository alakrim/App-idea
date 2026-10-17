/*
 * QA-F proof (P1, money). A chapter analysis whose second chunk fails throws away the first chunk's
 * paid reply, because the chunk results live only in analyzeChapter's local array. The retry then
 * calls the model for chunk one again. Expected after the fix: the retry makes one call (chunk two),
 * and chunk one is reused from a checkpoint. This test fails until per-chunk checkpoints land.
 */
import { sentences } from './__fixtures__/builders';
import { analyzeChapter } from './map-reduce';
import { reply as replyWith } from '../llm/__fixtures__/replies';

import type { AnalyzeChapterInput } from './map-reduce';
import type { LlmTransport } from '../llm/transport';

const memoryJson = (summary: string): string => JSON.stringify({ memory: { summary }, cues: [] });

describe('QA-F audit: analysis retry re-buys finished chunks', () => {
  it('a retry after chunk two fails does not call the model for chunk one again', async () => {
    let calls = 0;
    const transport: LlmTransport = async () => {
      calls += 1;
      if (calls === 2) throw new Error('connection reset');
      return replyWith(memoryJson('Part.'));
    };
    const input: AnalyzeChapterInput = {
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
    };

    await expect(analyzeChapter(input)).rejects.toThrow('connection reset');
    await analyzeChapter(input);

    // Run one: chunk one, then chunk two (fails). Run two should make one call, for chunk two.
    expect(calls).toBe(3);
  });
});
