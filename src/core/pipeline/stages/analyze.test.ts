import { ANALYSIS_SAMPLING } from '@/core/analysis/limits';
import { reply } from '@/core/llm/__fixtures__/replies';
import type { LlmReply, LlmRequest } from '@/core/llm/transport';

import { CHAPTER_ID, createFakePorts, ulid } from '../__fixtures__/fake-ports';
import { runChapter } from '../runner';

const SECOND = ulid(9);
const THIRD = ulid(10);

/** Ten sentences of about 140 characters each: about 250 words, so one cue may be accepted. */
const sentence = (n: number): string =>
  `Chapter sentence ${n} describes the harbour: rain keeps falling on the slate roofs while the gulls drift over the grey water.`;
const TEXT = Array.from({ length: 10 }, (_, n) => sentence(n)).join(' ');
const EDITED = TEXT.replace('sentence 3 ', 'sentence 3 now ');

/** An analysis reply with one cue of `category` over the first five sentences. */
function analysisReply(category: string): LlmReply {
  return reply(
    JSON.stringify({
      memory: {
        summary: 'Rain falls on the harbour.',
        keyEvents: [],
        characters: [],
        places: [],
        items: [],
        relationships: [],
        openThreads: [],
        glossary: [],
      },
      cues: [
        {
          category,
          startSentence: 0,
          endSentence: 4,
          intensity: 'low',
          confidence: 0.8,
          reason: 'Rain on the roofs.',
        },
      ],
    }),
  );
}

describe('analyze stage: reproducible cues', () => {
  it('gives identical text identical cues across two runs, and the second run makes no cue call', async () => {
    let answer = 'light_rain';
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      llm: (request: LlmRequest) =>
        request.jsonSchema?.name === 'chapter_analysis' ? analysisReply(answer) : undefined,
    });
    const analysisCalls = () =>
      fake.state.llmCalls.filter((c) => c.request.jsonSchema?.name === 'chapter_analysis');

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');
    const first = fake.state.cues.get(CHAPTER_ID);
    expect(first).toEqual([expect.objectContaining({ category: 'light_rain' })]);
    const callsAfterFirstRun = analysisCalls().length;

    // The model now names another bed. A cache hit must ignore that and keep the first cues.
    answer = 'city_night';
    fake.addChapter(SECOND, 2, TEXT);
    expect((await runChapter(SECOND, fake.ports)).status).toBe('ready');

    expect(fake.state.cues.get(SECOND)).toEqual(first);
    expect(analysisCalls()).toHaveLength(callsAfterFirstRun + 1);
    expect(analysisCalls().at(-1)?.request.user).toContain('already decided');
    expect(fake.state.cueReports.get(SECOND)).toMatchObject({ fromCache: true, accepted: 1 });
    expect(fake.state.cueReports.get(CHAPTER_ID)).toMatchObject({
      fromCache: false,
      accepted: 1,
    });
  });

  it('sends every analysis call with temperature 0 and the fixed seed', async () => {
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      llm: (request) =>
        request.jsonSchema?.name === 'chapter_analysis' ? analysisReply('light_rain') : undefined,
    });

    await runChapter(CHAPTER_ID, fake.ports);

    const analysis = fake.state.llmCalls.filter(
      (c) => c.request.jsonSchema?.name === 'chapter_analysis',
    );
    expect(analysis.length).toBeGreaterThan(0);
    for (const call of analysis) {
      expect(call.request.temperature).toBe(ANALYSIS_SAMPLING.temperature);
      expect(call.request.seed).toBe(ANALYSIS_SAMPLING.seed);
    }
  });

  it('analyses again when the text changes, because the cache key is the text', async () => {
    let answer = 'light_rain';
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      llm: (request: LlmRequest) =>
        request.jsonSchema?.name === 'chapter_analysis' ? analysisReply(answer) : undefined,
    });
    await runChapter(CHAPTER_ID, fake.ports);

    answer = 'city_night';
    fake.addChapter(THIRD, 3, EDITED);
    await runChapter(THIRD, fake.ports);

    expect(fake.state.cues.get(THIRD)).toEqual([
      expect.objectContaining({ category: 'city_night' }),
    ]);
    expect(fake.state.cueReports.get(THIRD)).toMatchObject({ fromCache: false });
  });
});
