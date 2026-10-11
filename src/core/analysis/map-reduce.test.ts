import { AnalysisOutputError } from './analysis-call';
import { ANALYSIS_SYSTEM_PROMPT } from './prompts';
import { analyzeChapter, planAnalysisChunks } from './map-reduce';
import { sentences } from './__fixtures__/builders';
import type { LlmTransport } from './llm';

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
    return reply(req.user, calls.length);
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

describe('planAnalysisChunks', () => {
  it('keeps everything in one chunk when it fits', () => {
    expect(planAnalysisChunks(sentences(5, 100), 10_000)).toHaveLength(1);
  });

  it('splits greedily by character budget without reordering sentences', () => {
    const chunks = planAnalysisChunks(sentences(10, 100), 350);
    expect(chunks.map((c) => c.length)).toEqual([3, 3, 3, 1]);
    expect(chunks.flat().map((s) => s.idx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('gives an oversized sentence a chunk of its own', () => {
    const chunks = planAnalysisChunks(
      [
        { idx: 0, text: 'short' },
        { idx: 1, text: 'x'.repeat(900) },
        { idx: 2, text: 'short' },
      ],
      100,
    );
    expect(chunks.map((c) => c.map((s) => s.idx))).toEqual([[0], [1], [2]]);
  });

  it('returns no chunks for an empty chapter', () => {
    expect(planAnalysisChunks([], 100)).toEqual([]);
  });
});

describe('analyzeChapter', () => {
  it('makes one call for a single-chunk chapter and validates its cues', async () => {
    const reply = JSON.stringify({
      memory: { summary: 'Rain falls on the town.', keyEvents: ['Rain starts'], characters: [{ name: 'Ana', aliases: [], facts: ['waits'] }] },
      cues: [{ category: 'light_rain', startSentence: 0, endSentence: 4, intensity: 'low', confidence: 0.8, reason: 'Rain on roofs' }],
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
      expect.objectContaining({ category: 'light_rain', startSentence: 0, endSentence: 4, intensity: 'low', fadeInMs: 3000 }),
    ]);
    expect(result.dropped).toEqual([]);
  });

  it('runs one call per chunk, merges memories, reduces the summary, and merges cues across the boundary', async () => {
    const chunkA = JSON.stringify({
      memory: { summary: 'Part one happens.', openThreads: ['Who sent the letter?'] },
      cues: [{ category: 'city_night', startSentence: 2, endSentence: 4, confidence: 0.7, reason: 'Night streets' }],
    });
    const chunkB = JSON.stringify({
      memory: { summary: 'Part two follows.', openThreads: ['Where is the key?'] },
      cues: [{ category: 'city_night', startSentence: 5, endSentence: 7, confidence: 0.9, reason: 'Still night' }],
    });
    const { transport, calls } = scriptedTransport((user) => {
      if (user.includes('Part 1:')) return 'The chapter opens in the city and moves on to the harbour.';
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
    expect(result.memory.summary).toBe('The chapter opens in the city and moves on to the harbour.');
    expect(result.memory.openThreads).toEqual(['Where is the key?']);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]).toMatchObject({ category: 'city_night', startSentence: 2, endSentence: 7, confidence: 0.9 });
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
    const { transport, calls } = scriptedTransport((_user, call) => (call === 1 ? 'oops' : memoryJson('Fixed.')));
    const result = await analyzeChapter({ ...BASE_INPUT, sentences: sentences(4, 80), callLlm: transport });
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
