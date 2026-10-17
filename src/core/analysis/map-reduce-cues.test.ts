import { sentences } from './__fixtures__/builders';
import { ANALYSIS_SAMPLING, CUE_LIMITS } from './limits';
import { analyzeChapter } from './map-reduce';
import { reply } from '../llm/__fixtures__/replies';

import type { ValidatedCue } from './types';
import type { LlmRequest, LlmTransport } from '../llm/transport';

const MEMORY = {
  summary: 'Rain falls on the town.',
  keyEvents: [],
  characters: [],
  places: [],
  items: [],
  relationships: [],
  openThreads: [],
  glossary: [],
};

const rawCue = {
  category: 'light_rain',
  startSentence: 0,
  endSentence: 4,
  intensity: 'low',
  confidence: 0.8,
  reason: 'Rain on roofs',
};

const ANALYSIS = 'chapter_analysis';
const FALLBACK = 'setting_fallback';

/** A transport that answers by schema name, and records every request it gets. */
function transportFor(answers: {
  analysis?: (call: number) => unknown;
  fallback?: string;
  summary?: string;
}): { transport: LlmTransport; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  let analysisCalls = 0;
  const transport: LlmTransport = async (request) => {
    requests.push(request);
    if (request.jsonSchema?.name === ANALYSIS) {
      analysisCalls += 1;
      return reply(
        JSON.stringify({ memory: MEMORY, cues: answers.analysis?.(analysisCalls) ?? [] }),
      );
    }
    if (request.jsonSchema?.name === FALLBACK) {
      return reply(answers.fallback ?? '{"cue": null}');
    }
    return reply(answers.summary ?? 'Summary.');
  };
  return { transport, requests };
}

const named = (requests: LlmRequest[], name: string) =>
  requests.filter((r) => r.jsonSchema?.name === name);

/** 10 long sentences: about 220 words and well over the cue span, so a cue can be accepted. */
const LONG_CHAPTER = sentences(10, 130);
const BASE = {
  seriesTitle: 'S',
  chapterTitle: 'C',
  lang: 'en' as const,
  priorContext: '',
  wordCount: 220,
  reduceSummary: false,
};

describe('single-bed fallback in analyzeChapter', () => {
  it('runs once for a chapter of 200+ words with no valid cue, and keeps its bed for the whole chapter', async () => {
    const { transport, requests } = transportFor({
      fallback: JSON.stringify({
        cue: { category: 'tavern_crowd', intensity: 'medium', confidence: 0.7, reason: 'The inn.' },
      }),
    });

    const result = await analyzeChapter({
      ...BASE,
      sentences: LONG_CHAPTER,
      callLlm: transport,
    });

    expect(named(requests, FALLBACK)).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(result.fallbackRan).toBe(true);
    expect(result.cues).toEqual([
      expect.objectContaining({
        category: 'tavern_crowd',
        startSentence: 0,
        endSentence: 9,
        confidence: 0.7,
      }),
    ]);
  });

  it('keeps the chapter cue-less when the fallback names no setting', async () => {
    const { transport, requests } = transportFor({});
    const result = await analyzeChapter({ ...BASE, sentences: LONG_CHAPTER, callLlm: transport });
    expect(named(requests, FALLBACK)).toHaveLength(1);
    expect(result).toMatchObject({ cues: [], fallbackRan: true });
  });

  it('validates the fallback bed with the same rules, so a low-confidence bed is dropped', async () => {
    const { transport } = transportFor({
      fallback: JSON.stringify({
        cue: { category: 'tavern_crowd', intensity: null, confidence: 0.2, reason: null },
      }),
    });
    const result = await analyzeChapter({ ...BASE, sentences: LONG_CHAPTER, callLlm: transport });
    expect(result.cues).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual(['low_confidence']);
  });

  it('does not run under 200 words', async () => {
    const { transport, requests } = transportFor({});
    const result = await analyzeChapter({
      ...BASE,
      wordCount: CUE_LIMITS.minWordsForCues - 1,
      sentences: LONG_CHAPTER,
      callLlm: transport,
    });
    expect(named(requests, FALLBACK)).toEqual([]);
    expect(result.fallbackRan).toBe(false);
  });

  it('does not run when the chunks already produced a valid cue', async () => {
    const { transport, requests } = transportFor({ analysis: () => [rawCue] });
    const result = await analyzeChapter({ ...BASE, sentences: LONG_CHAPTER, callLlm: transport });
    expect(named(requests, FALLBACK)).toEqual([]);
    expect(result.cues).toHaveLength(1);
    expect(result.fallbackRan).toBe(false);
  });

  it('runs at most once, even for a chapter split into several chunks', async () => {
    const { transport, requests } = transportFor({});
    const result = await analyzeChapter({
      ...BASE,
      sentences: LONG_CHAPTER,
      callLlm: transport,
      planChunks: (s) => [s.slice(0, 4), s.slice(4)],
    });
    expect(named(requests, FALLBACK)).toHaveLength(1);
    expect(result.fallbackRan).toBe(true);
  });
});

describe('cached cues (cachedCues)', () => {
  const cached: ValidatedCue[] = [
    {
      category: 'city_night',
      startSentence: 2,
      endSentence: 6,
      intensity: 'medium',
      fadeInMs: 2500,
      fadeOutMs: 3000,
      confidence: 0.9,
      reason: 'Night streets.',
    },
  ];

  it('uses the cached cues, asks the model for memory only and makes no fallback call', async () => {
    // The model still sends a cue here. It must be ignored, because the cached cues win.
    const { transport, requests } = transportFor({ analysis: () => [rawCue] });
    const result = await analyzeChapter({
      ...BASE,
      sentences: LONG_CHAPTER,
      callLlm: transport,
      cachedCues: cached,
    });

    expect(result.cues).toEqual(cached);
    expect(result.dropped).toEqual([]);
    expect(result.fallbackRan).toBe(false);
    expect(named(requests, FALLBACK)).toEqual([]);
    expect(named(requests, ANALYSIS)[0]?.user).toContain('already decided');
  });

  it('gives the same cues for the same cached input, whatever the model replies', async () => {
    const first = transportFor({ analysis: () => [rawCue] });
    const second = transportFor({
      analysis: () => [{ ...rawCue, category: 'forest_night', confidence: 0.5 }],
    });
    const a = await analyzeChapter({
      ...BASE,
      sentences: LONG_CHAPTER,
      callLlm: first.transport,
      cachedCues: cached,
    });
    const b = await analyzeChapter({
      ...BASE,
      sentences: LONG_CHAPTER,
      callLlm: second.transport,
      cachedCues: cached,
    });
    expect(b.cues).toEqual(a.cues);
  });

  it('keeps an empty cached result empty, and still makes no fallback call', async () => {
    const { transport, requests } = transportFor({});
    const result = await analyzeChapter({
      ...BASE,
      sentences: LONG_CHAPTER,
      callLlm: transport,
      cachedCues: [],
    });
    expect(result.cues).toEqual([]);
    expect(named(requests, FALLBACK)).toEqual([]);
  });
});

describe('sampling', () => {
  it('sends temperature 0 and the fixed seed on every analysis call, the summary reduce and the fallback', async () => {
    const { transport, requests } = transportFor({ summary: 'Joined summary.' });
    await analyzeChapter({
      ...BASE,
      reduceSummary: true,
      sentences: LONG_CHAPTER,
      callLlm: transport,
      planChunks: (s) => [s.slice(0, 5), s.slice(5)],
    });

    expect(requests.length).toBeGreaterThanOrEqual(4);
    for (const request of requests) {
      expect(request.temperature).toBe(0);
      expect(request.seed).toBe(ANALYSIS_SAMPLING.seed);
    }
  });
});
