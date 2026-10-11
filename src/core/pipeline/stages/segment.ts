/** The segment stage: source text in, paragraphs and sentences with stable indices out. */
import { buildChapterText } from '@/core/text/build';
import { stableHash, hashText } from '../hash';
import { StageFailure } from '../errors';

import type { StageDefinition } from '../context';

export const segmentStage: StageDefinition = {
  stage: 'segment',
  async prepare(ctx) {
    const text = await ctx.ports.chapters.getSourceText(ctx.chapterId);
    if (text === null || text.trim() === '') {
      throw new StageFailure('CONTENT_EMPTY', 'There is no text to split into sentences.', {
        retryable: false,
        detail: 'no_source_text',
      });
    }
    const lang = ctx.record.chapter.sourceLang ?? undefined;
    const inputHash = stableHash(['segment', hashText(text), lang ?? null]);
    return {
      inputHash,
      model: null,
      promptVersion: null,
      skip: false,
      async execute() {
        const built = buildChapterText(text, lang);
        if (built.sentences.length === 0) {
          throw new StageFailure('CONTENT_EMPTY', 'No sentences were found in this chapter.', {
            retryable: false,
          });
        }
        await ctx.ports.chapters.replaceText(ctx.chapterId, built);
      },
    };
  },
};
