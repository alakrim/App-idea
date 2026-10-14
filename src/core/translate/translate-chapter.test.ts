import {
  TRANSLATE_CHUNK_TOKENS,
  translateChapter,
  TranslateOutputError,
} from './translate-chapter';
import { FAKE_USAGE, reply } from '../llm/__fixtures__/replies';
import { LlmCancelledError } from '../llm/transport';

import type { ChunkPlanner, TranslateChapterInput, TranslateProgress } from './translate-chapter';
import type { TranslateSentence } from './types';
import type { LlmReply, LlmRequest, LlmTransport } from '../llm/transport';

/** Reads the `[idx] text` lines after the passage header, so context lines are ignored. */
function passageOf(user: string): { idx: number; text: string }[] {
  const start = user.indexOf('Passage (');
  return user
    .slice(start)
    .split('\n')
    .flatMap((line) => {
      const match = /^\[(\d+)\] (.*)$/u.exec(line);
      return match ? [{ idx: Number(match[1]), text: match[2] ?? '' }] : [];
    });
}

/** A well-behaved model: one item per passage sentence, with a recognisable prefix. */
function echo(user: string): string {
  return JSON.stringify({
    items: passageOf(user).map(({ idx, text }) => ({ idx, text: `EN ${text}` })),
  });
}

function fakeLlm(respond: (user: string, call: number) => string | Promise<string>): {
  llm: LlmTransport;
  requests: LlmRequest[];
} {
  const requests: LlmRequest[] = [];
  const llm: LlmTransport = async (request): Promise<LlmReply> => {
    requests.push(request);
    return reply(await respond(request.user, requests.length));
  };
  return { llm, requests };
}

const SENTENCES: TranslateSentence[] = [
  { idx: 0, text: 'Uno.' },
  { idx: 1, text: 'Due.' },
  { idx: 2, text: 'Tre.' },
  { idx: 3, text: 'Quattro.' },
];

function input(overrides: Partial<TranslateChapterInput> & Pick<TranslateChapterInput, 'llm'>) {
  return {
    sentences: SENTENCES,
    sourceLang: 'it',
    targetLang: 'en',
    glossary: [],
    ...overrides,
  } satisfies TranslateChapterInput;
}

/** Splits the four sentences into two chunks, so continuity can be checked. */
const TWO_CHUNKS: ChunkPlanner = () => [
  { start: 0, end: 1 },
  { start: 2, end: 3 },
];

describe('translateChapter: the happy path', () => {
  it('translates every idx in one request when the chapter fits one chunk', async () => {
    const { llm, requests } = fakeLlm((user) => echo(user));
    const result = await translateChapter(input({ llm }));

    expect([...result.translations]).toEqual([
      [0, 'EN Uno.'],
      [1, 'EN Due.'],
      [2, 'EN Tre.'],
      [3, 'EN Quattro.'],
    ]);
    expect(result.partialIdx).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(result.usage.requests).toBe(1);
    expect(result.usage.repairRequests).toBe(0);
    expect(result.usage.usage).toEqual(FAKE_USAGE);
  });

  it('sends the system prompt, the languages and the glossary in the request', async () => {
    const { llm, requests } = fakeLlm((user) => echo(user));
    await translateChapter(
      input({
        llm,
        styleNotes: 'formal',
        glossary: [{ term: 'Ada', translation: 'Ada', note: null }],
      }),
    );
    const [request] = requests;
    expect(request?.system).toContain('translation engine');
    expect(request?.user).toContain('Source language: it\nTarget language: en');
    expect(request?.user).toContain('Style notes: formal');
    expect(request?.user).toContain('- Ada => Ada');
  });

  it('returns an empty result without calling the model for an empty chapter', async () => {
    const { llm, requests } = fakeLlm(() => {
      throw new Error('must not be called');
    });
    const result = await translateChapter(input({ llm, sentences: [] }));
    expect(requests).toHaveLength(0);
    expect(result.translations.size).toBe(0);
    expect(result.usage).toEqual({
      requests: 0,
      repairRequests: 0,
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    });
  });

  it('returns blank sentences unchanged and never sends them', async () => {
    const { llm, requests } = fakeLlm((user) => echo(user));
    const result = await translateChapter(
      input({
        llm,
        sentences: [
          { idx: 0, text: 'Uno.' },
          { idx: 1, text: '   ' },
          { idx: 2, text: 'Tre.' },
        ],
      }),
    );
    expect(passageOf(requests[0]?.user ?? '').map((s) => s.idx)).toEqual([0, 2]);
    expect(result.translations.get(1)).toBe('   ');
    expect(result.partialIdx).toEqual([]);
  });
});

describe('translateChapter: alignment repair', () => {
  it('re-requests only the missing idx and merges the repair', async () => {
    const { llm, requests } = fakeLlm((user, call) => {
      if (call === 1) {
        return JSON.stringify({
          items: [
            { idx: 0, text: 'EN Uno.' },
            { idx: 3, text: 'EN Quattro.' },
          ],
        });
      }
      return echo(user);
    });
    const result = await translateChapter(input({ llm }));

    expect(requests).toHaveLength(2);
    const repairUser = requests[1]?.user ?? '';
    expect(passageOf(repairUser).map((s) => s.idx)).toEqual([1, 2]);
    expect(repairUser).toContain('missing from the previous reply: 1, 2');
    expect(result.translations.get(1)).toBe('EN Due.');
    expect(result.translations.get(2)).toBe('EN Tre.');
    expect(result.partialIdx).toEqual([]);
    expect(result.usage.repairRequests).toBe(1);
  });

  it('falls back to the source text for what the repair still misses, and flags partial', async () => {
    const { llm } = fakeLlm((_user, call) => {
      if (call === 1) return JSON.stringify({ items: [{ idx: 0, text: 'EN Uno.' }] });
      // The repair supplies idx 1 and leaves idx 2 blank, and idx 3 is absent.
      return JSON.stringify({
        items: [
          { idx: 1, text: 'EN Due.' },
          { idx: 2, text: '  ' },
        ],
      });
    });
    const result = await translateChapter(input({ llm }));

    expect(result.translations.get(0)).toBe('EN Uno.');
    expect(result.translations.get(1)).toBe('EN Due.');
    expect(result.translations.get(2)).toBe('Tre.');
    expect(result.translations.get(3)).toBe('Quattro.');
    expect(result.partialIdx).toEqual([2, 3]);
  });

  it('falls back for the whole missing set when the repair reply is not valid JSON', async () => {
    const { llm } = fakeLlm((_user, call) => (call === 1 ? '{"items":[]}' : 'not json at all'));
    const result = await translateChapter(input({ llm }));

    expect([...result.translations.values()]).toEqual(['Uno.', 'Due.', 'Tre.', 'Quattro.']);
    expect(result.partialIdx).toEqual([0, 1, 2, 3]);
    expect(result.usage.requests).toBe(2);
  });

  it('ignores extra idx values and keeps the first of any duplicates', async () => {
    const { llm, requests } = fakeLlm(() =>
      JSON.stringify({
        items: [
          { idx: 0, text: 'first' },
          { idx: 0, text: 'second' },
          { idx: 1, text: 'EN Due.' },
          { idx: 2, text: 'EN Tre.' },
          { idx: 3, text: 'EN Quattro.' },
          { idx: 99, text: 'stray' },
        ],
      }),
    );
    const result = await translateChapter(input({ llm }));
    expect(requests).toHaveLength(1);
    expect(result.translations.get(0)).toBe('first');
    expect(result.translations.has(99)).toBe(false);
    expect(result.partialIdx).toEqual([]);
  });
});

describe('translateChapter: malformed output', () => {
  it('retries once with the reason when the first reply is not valid', async () => {
    const { llm, requests } = fakeLlm((user, call) =>
      call === 1 ? 'Sure, here you go' : echo(user),
    );
    const result = await translateChapter(input({ llm }));

    expect(requests).toHaveLength(2);
    expect(requests[1]?.user).toContain('could not be used (reply is not valid JSON)');
    expect(result.translations.get(0)).toBe('EN Uno.');
    expect(result.usage.repairRequests).toBe(1);
  });

  it('throws a typed error when the reply is still invalid after the repair', async () => {
    const { llm, requests } = fakeLlm(() => 'still not json');
    const error = await translateChapter(input({ llm })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranslateOutputError);
    expect(error).toMatchObject({ code: 'LLM_INVALID_OUTPUT' });
    expect(requests).toHaveLength(2);
  });

  it('propagates transport errors unchanged', async () => {
    const llm: LlmTransport = () => Promise.reject(new Error('network down'));
    await expect(translateChapter(input({ llm }))).rejects.toThrow('network down');
  });
});

describe('translateChapter: chunk continuity', () => {
  it('passes the last translated sentences of the prior chunk as context', async () => {
    const { llm, requests } = fakeLlm((user) => echo(user));
    const result = await translateChapter(input({ llm, chunker: TWO_CHUNKS }));

    expect(requests).toHaveLength(2);
    const second = requests[1]?.user ?? '';
    expect(second).toContain('[0] Uno.\n  => EN Uno.');
    expect(second).toContain('[1] Due.\n  => EN Due.');
    expect(passageOf(second).map((s) => s.idx)).toEqual([2, 3]);
    expect(result.partialIdx).toEqual([]);
  });

  it('uses the default planner (about 1,500 tokens per chunk, no overlap) for long chapters', async () => {
    const long: TranslateSentence[] = Array.from({ length: 10 }, (_, idx) => ({
      idx,
      text: `S${idx} ${'x'.repeat(990)}`,
    }));
    const { llm, requests } = fakeLlm((user) => echo(user));
    const result = await translateChapter(input({ llm, sentences: long }));

    expect(TRANSLATE_CHUNK_TOKENS).toBe(1500);
    expect(requests).toHaveLength(2);
    expect(passageOf(requests[0]?.user ?? '').map((s) => s.idx)).toEqual([0, 1, 2, 3, 4, 5]);
    const second = requests[1]?.user ?? '';
    expect(passageOf(second).map((s) => s.idx)).toEqual([6, 7, 8, 9]);
    expect(second).toContain('[1] S1 ');
    expect(second).toContain('[5] S5 ');
    expect(second).not.toContain('[0] S0 ');
    expect(result.translations.size).toBe(10);
  });

  it('marks context as pending when chunks run concurrently', async () => {
    const { llm, requests } = fakeLlm((user) => echo(user));
    const result = await translateChapter(input({ llm, chunker: TWO_CHUNKS, concurrency: 2 }));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.user).toContain('(translation pending)');
    expect(result.translations.get(3)).toBe('EN Quattro.');
    expect(result.partialIdx).toEqual([]);
  });
});

describe('translateChapter: progress, coverage and input checks', () => {
  it('reports progress after each chunk', async () => {
    const { llm } = fakeLlm((user) => echo(user));
    const progress: TranslateProgress[] = [];
    await translateChapter(
      input({ llm, chunker: TWO_CHUNKS, onProgress: (p) => progress.push(p) }),
    );
    expect(progress).toEqual([
      { translated: 2, total: 4 },
      { translated: 4, total: 4 },
    ]);
  });

  it('gives the source text, flagged partial, to a sentence a custom planner skipped', async () => {
    const { llm } = fakeLlm((user) => echo(user));
    const result = await translateChapter(input({ llm, chunker: () => [{ start: 0, end: 1 }] }));
    expect(result.translations.get(2)).toBe('Tre.');
    expect(result.partialIdx).toEqual([2, 3]);
  });

  it('rejects duplicate idx values and a concurrency below 1', async () => {
    const { llm } = fakeLlm((user) => echo(user));
    await expect(
      translateChapter(
        input({
          llm,
          sentences: [
            { idx: 0, text: 'a' },
            { idx: 0, text: 'b' },
          ],
        }),
      ),
    ).rejects.toThrow(RangeError);
    await expect(translateChapter(input({ llm, concurrency: 0 }))).rejects.toThrow(RangeError);
  });
});

describe('translateChapter: cancellation', () => {
  it('rejects at once when the signal is already aborted, without calling the model', async () => {
    const { llm, requests } = fakeLlm((user) => echo(user));
    const controller = new AbortController();
    controller.abort();
    const error = await translateChapter(input({ llm, signal: controller.signal })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LlmCancelledError);
    expect(error).toMatchObject({ name: 'AbortError', code: 'CANCELLED' });
    expect(requests).toHaveLength(0);
  });

  it('stops before the next chunk when aborted during a call', async () => {
    const controller = new AbortController();
    const { llm, requests } = fakeLlm((user) => {
      controller.abort();
      return echo(user);
    });
    await expect(
      translateChapter(input({ llm, signal: controller.signal, chunker: TWO_CHUNKS })),
    ).rejects.toBeInstanceOf(LlmCancelledError);
    expect(requests).toHaveLength(1);
  });

  it('passes the signal to every model call', async () => {
    const controller = new AbortController();
    const { llm, requests } = fakeLlm((user) => echo(user));
    await translateChapter(input({ llm, signal: controller.signal, chunker: TWO_CHUNKS }));
    expect(requests.map((r) => r.signal)).toEqual([controller.signal, controller.signal]);
  });

  it('sends the strict translation JSON schema with every call', async () => {
    const { llm, requests } = fakeLlm((user) => echo(user));
    await translateChapter(input({ llm }));
    expect(requests[0]?.jsonSchema?.name).toBe('chapter_translation');
  });

  it('sums the billed usage of every call, repairs included', async () => {
    let call = 0;
    const llm: LlmTransport = async (request): Promise<LlmReply> => {
      call += 1;
      const text = call === 1 ? 'not json' : echo(request.user);
      return reply(text, { promptTokens: 10 * call, completionTokens: 1, costUsd: 0.5 });
    };
    const result = await translateChapter(input({ llm }));
    expect(result.usage).toEqual({
      requests: 2,
      repairRequests: 1,
      usage: { promptTokens: 30, completionTokens: 2, costUsd: 1 },
    });
  });
});
