import { CHAPTER_ID, createFakePorts } from '../__fixtures__/fake-ports';
import { runChapter } from '../runner';

import type { LlmRequest } from '@/core/llm/transport';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('translate stage', () => {
  it('keeps three translation requests in flight at once', async () => {
    // About 40,000 characters: several 1,500-token translation chunks.
    const text = 'The lamp burned low in the window. '.repeat(1_200);
    let inFlight = 0;
    let maxInFlight = 0;
    let translationCalls = 0;
    const fake = createFakePorts({
      sourceText: text,
      targetLang: 'it',
      llm: async (request: LlmRequest) => {
        if (request.jsonSchema?.name !== 'chapter_translation') return undefined;
        translationCalls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await wait(5);
        inFlight -= 1;
        return undefined;
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');

    expect(translationCalls).toBeGreaterThanOrEqual(4);
    expect(maxInFlight).toBe(3);
    expect(fake.job('translate')?.status).toBe('done');
  });
});
