import { sentences } from './__fixtures__/builders';
import { AnalysisOutputError } from './analysis-call';
import { analyzeChapter } from './map-reduce';
import { ANALYSIS_SYSTEM_PROMPT } from './prompts';

import { reply as replyWith } from '../llm/__fixtures__/replies';

import type { LlmTransport } from '../llm/transport';

const memoryJson = (summary: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ memory: { summary, ...extra }, cues: [] });

/** Routes calls by their user message so that chunk calls and the reduce call get different replies. */
function scriptedTransport(reply: (user: string, call: number) => string): {
  transport: LlmTransport;
  calls: { system: string; user: string }[];
} {
  const calls: { system: string; user: string }[] = [];
  const transport: LlmTransport = async (req) => {
    calls.push({ system: req.system, user: req.user });
    return replyWith(reply(req.user, calls.length));
  };
  return { transport, calls };
}

const BASE_INPUT = {
  seriesTitle: 'The Series',
  chapterTitle: 'Chapter 4',
  lang: 'en',
  priorContext: '',
  wordCount: 10_000,
};

describe('default chunk planner (planLlmChunks adapter)', () => {
  it('keeps a short chapter in one chunk and one call', async () => {
    const { transport, calls } = scriptedTransport(() => memoryJson('Short.'));
    const result = await analyzeChapter({
      ...BASE_INPUT,
      sentences: sentences(5, 100),
      callLlm: transport,
    });
    expect(result.chunkCount).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('splits a chapter over the token budget into several chunks, in order, without loss', async () => {
    // Each sentence is ~4,000 Latin characters, about 1,000 tokens, so the 12,000-token budget holds 12.
    const long = sentences(40, 4000);
    const { transport, calls } = scriptedTransport(() => memoryJson('Part.'));
    const result = await analyzeChapter({
      ...BASE_INPUT,
      sentences: long,
      callLlm: transport,
      reduceSummary: false,
    });
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(calls).toHaveLength(result.chunkCount);
    const sentenceIdxSeen = calls.flatMap((c) =>
      [...c.user.matchAll(/^\[(\d+)\] /gm)].map((m) => Number(m[1])),
    );
    expect(sentenceIdxSeen).toEqual(long.map((s) => s.idx));
  });
});

describe('analyzeChapter', () => {
  it('makes one call for a single-chunk chapter and validates its cues', async () => {
    const reply = JSON.stringify({
      memory: {
        summary: 'Rain falls on the town.',
        keyEvents: ['Rain starts'],
        characters: [{ name: 'Ana', aliases: [], role: null, facts: ['waits'] }],
      },
      cues: [
        {
          category: 'light_rain',
          startSentence: 0,
          endSentence: 4,
          intensity: 'low',
          confidence: 0.8,
          reason: 'Rain on roofs',
        },
      ],
    });
    const { transport, calls } = scriptedTransport(() => reply);

    const result = await analyzeChapter({
      ...BASE_INPUT,
      sentences: sentences(8, 80),
      callLlm: transport,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe(ANALYSIS_SYSTEM_PROMPT);
    expect(calls[0]?.user).toContain('[0] S0');
    expect(result.chunkCount).toBe(1);
    expect(result.memory.summary).toBe('Rain falls on the town.');
    expect(result.memory.characters[0]?.name).toBe('Ana');
    expect(result.cues).toEqual([
      expect.objectContaining({
        category: 'light_rain',
        startSentence: 0,
        endSentence: 4,
        intensity: 'low',
        fadeInMs: 3000,
      }),
    ]);
    expect(result.dropped).toEqual([]);
  });

  it('runs one call per chunk, merges memories, reduces the summary, and merges cues across the boundary', async () => {
    const chunkA = JSON.stringify({
      memory: { summary: 'Part one happens.', openThreads: ['Who sent the letter?'] },
      cues: [
        {
          category: 'city_night',
          startSentence: 2,
          endSentence: 4,
          intensity: null,
          confidence: 0.7,
          reason: 'Night streets',
        },
      ],
    });
    const chunkB = JSON.stringify({
      memory: { summary: 'Part two follows.', openThreads: ['Where is the key?'] },
      cues: [
        {
          category: 'city_night',
          startSentence: 5,
          endSentence: 7,
          intensity: null,
          confidence: 0.9,
          reason: 'Still night',
        },
      ],
    });
    const { transport, calls } = scriptedTransport((user) => {
      if (user.includes('Part 1:'))
        return 'The chapter opens in the city and moves on to the harbour.';
      return user.includes('[0] ') ? chunkA : chunkB;
    });

    const result = await analyzeChapter({
      ...BASE_INPUT,
      // 120-character sentences: a 3-sentence cue is 360 chars, about 24 s, so it passes the span rule.
      sentences: sentences(8, 120),
      callLlm: transport,
      planChunks: (s) => [s.slice(0, 5), s.slice(5)],
    });

    // Two chunk calls, then one summary reduce call.
    expect(calls).toHaveLength(3);
    expect(calls[2]?.user).toContain('Part 1: Part one happens.');
    expect(result.chunkCount).toBe(2);
    expect(result.memory.summary).toBe(
      'The chapter opens in the city and moves on to the harbour.',
    );
    expect(result.memory.openThreads).toEqual(['Where is the key?']);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]).toMatchObject({
      category: 'city_night',
      startSentence: 2,
      endSentence: 7,
      confidence: 0.9,
    });
  });

  it('keeps the joined summary when reduceSummary is false', async () => {
    const { transport, calls } = scriptedTransport((user) =>
      user.includes('[0] ') ? memoryJson('One.') : memoryJson('Two.'),
    );
    const result = await analyzeChapter({
      ...BASE_INPUT,
      sentences: sentences(6, 80),
      callLlm: transport,
      planChunks: (s) => [s.slice(0, 3), s.slice(3)],
      reduceSummary: false,
    });
    expect(calls).toHaveLength(2);
    expect(result.memory.summary).toBe('One. Two.');
  });

  it('repairs an invalid chunk reply once', async () => {
    const { transport, calls } = scriptedTransport((_user, call) =>
      call === 1 ? 'oops' : memoryJson('Fixed.'),
    );
    const result = await analyzeChapter({
      ...BASE_INPUT,
      sentences: sentences(4, 80),
      callLlm: transport,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.user).toContain('could not be used');
    expect(result.memory.summary).toBe('Fixed.');
  });

  it('raises AnalysisOutputError when the repair reply is also invalid', async () => {
    const { transport } = scriptedTransport(() => 'never json');
    await expect(
      analyzeChapter({ ...BASE_INPUT, sentences: sentences(4, 80), callLlm: transport }),
    ).rejects.toBeInstanceOf(AnalysisOutputError);
  });

  it('propagates transport errors unchanged', async () => {
    const transport: LlmTransport = async () => {
      throw new Error('402 insufficient credits');
    };
    await expect(
      analyzeChapter({ ...BASE_INPUT, sentences: sentences(4, 80), callLlm: transport }),
    ).rejects.toThrow('402 insufficient credits');
  });

  it('returns an empty analysis without calling the model for an empty chapter', async () => {
    const { transport, calls } = scriptedTransport(() => memoryJson('unused'));
    const result = await analyzeChapter({ ...BASE_INPUT, sentences: [], callLlm: transport });
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ chunkCount: 0, cues: [], dropped: [] });
    expect(result.memory.summary).toBe('');
  });

  it('rejects sentence indices that are not 0..n-1 in order', async () => {
    const { transport } = scriptedTransport(() => memoryJson('x'));
    await expect(
      analyzeChapter({ ...BASE_INPUT, sentences: sentences(3, 80, 5), callLlm: transport }),
    ).rejects.toThrow(RangeError);
  });
});
