import { z } from 'zod';

import { strictViolations } from '../__fixtures__/strict-json-schema';
import { parseAnalysisReply, runAnalysisCall } from './analysis-call';
import { MEMORY_LIMITS } from './limits';
import {
  analysisResponseSchema,
  memoryDraftSchema,
  normalizeMemory,
  rawCueSchema,
  truncateWords,
} from './schemas';
import { stripNulls } from './strip-nulls';

import type { CleanMemoryDraft } from './schemas';

const EMPTY_DRAFT: CleanMemoryDraft = {
  summary: '',
  keyEvents: [],
  characters: [],
  places: [],
  items: [],
  relationships: [],
  openThreads: [],
  glossary: [],
};

function words(n: number, word = 'word'): string {
  return Array.from({ length: n }, () => word).join(' ');
}

describe('truncateWords', () => {
  it('keeps text at or under the limit untouched', () => {
    expect(truncateWords('one two three', 3)).toBe('one two three');
  });

  it('truncates to exactly the limit, keeping the original spacing', () => {
    expect(truncateWords('alpha  beta\ngamma delta', 2)).toBe('alpha  beta');
  });

  it('counts each CJK ideograph as one word', () => {
    const text = '李明走进房间，看见了老师。';
    expect(truncateWords(text, 4)).toBe('李明走进');
  });

  it('counts a Latin word with an apostrophe or hyphen as one word', () => {
    expect(truncateWords("l'homme-clé parle", 1)).toBe("l'homme-clé");
  });
});

describe('normalizeMemory caps (truncation, never rejection)', () => {
  it('caps the summary at 120 words', () => {
    const out = normalizeMemory({ ...EMPTY_DRAFT, summary: words(200) });
    expect(out.summary.split(' ')).toHaveLength(MEMORY_LIMITS.summaryWords);
  });

  it('caps key events at 10 and each at 25 words, keeping order', () => {
    const events = Array.from({ length: 14 }, (_, i) => `event${i} ${words(30)}`);
    const out = normalizeMemory({ ...EMPTY_DRAFT, keyEvents: events });
    expect(out.keyEvents).toHaveLength(10);
    expect(out.keyEvents[0]?.startsWith('event0 ')).toBe(true);
    expect(out.keyEvents[9]?.startsWith('event9 ')).toBe(true);
    for (const e of out.keyEvents) expect(e.split(' ')).toHaveLength(25);
  });

  it('caps characters at 15 and facts per character at 5', () => {
    const characters = Array.from({ length: 20 }, (_, i) => ({
      name: `Person ${i}`,
      aliases: [],
      facts: Array.from({ length: 8 }, (_, f) => `fact ${i}.${f}`),
    }));
    const out = normalizeMemory({ ...EMPTY_DRAFT, characters });
    expect(out.characters).toHaveLength(15);
    expect(out.characters.every((c) => c.facts.length === 5)).toBe(true);
  });

  it('caps places and items at 8 and relationships at 10', () => {
    const places = Array.from({ length: 12 }, (_, i) => ({ name: `Place ${i}`, facts: [] }));
    const items = Array.from({ length: 12 }, (_, i) => ({ name: `Item ${i}`, facts: [] }));
    const relationships = Array.from({ length: 12 }, (_, i) => ({
      a: `A${i}`,
      b: 'B',
      nature: 'n',
    }));
    const out = normalizeMemory({ ...EMPTY_DRAFT, places, items, relationships });
    expect(out.places).toHaveLength(8);
    expect(out.items).toHaveLength(8);
    expect(out.relationships).toHaveLength(10);
  });

  it('caps open threads at 5 and glossary at 30', () => {
    const openThreads = Array.from({ length: 7 }, (_, i) => `question ${i}?`);
    const glossary = Array.from({ length: 40 }, (_, i) => ({ term: `term${i}` }));
    const out = normalizeMemory({ ...EMPTY_DRAFT, openThreads, glossary });
    expect(out.openThreads).toHaveLength(5);
    expect(out.glossary).toHaveLength(30);
  });

  it('keeps names exactly as written, collapsing only whitespace', () => {
    const out = normalizeMemory({
      ...EMPTY_DRAFT,
      characters: [{ name: '  Zoë   Ng ', aliases: ['Zoe'], facts: [] }],
    });
    expect(out.characters[0]?.name).toBe('Zoë Ng');
  });

  it('drops blanks and duplicates, and an alias equal to the name', () => {
    const out = normalizeMemory({
      ...EMPTY_DRAFT,
      keyEvents: ['A happens', '  ', 'A happens', 'B happens'],
      characters: [{ name: 'Ana', aliases: ['ana', 'Ana', 'Anita', ''], facts: ['x', 'x', ' '] }],
    });
    expect(out.keyEvents).toEqual(['A happens', 'B happens']);
    expect(out.characters[0]).toEqual({ name: 'Ana', aliases: ['Anita'], facts: ['x'] });
  });

  it('drops nameless entries rather than failing', () => {
    const out = normalizeMemory({
      ...EMPTY_DRAFT,
      characters: [{ name: ' ', aliases: [], facts: [] }],
    });
    expect(out.characters).toEqual([]);
  });

  it('omits an empty optional role and keeps a real one', () => {
    const out = normalizeMemory({
      ...EMPTY_DRAFT,
      characters: [
        { name: 'A', aliases: [], role: ' ', facts: [] },
        { name: 'B', aliases: [], role: 'captain', facts: [] },
      ],
    });
    expect(out.characters[0]).not.toHaveProperty('role');
    expect(out.characters[1]).toMatchObject({ role: 'captain' });
  });
});

describe('parseAnalysisReply', () => {
  const validReply = JSON.stringify({
    memory: { summary: 'They talk.' },
    cues: [{ category: 'light_rain', startSentence: 0, endSentence: 4, confidence: 0.8 }],
  });

  it('accepts a bare JSON object and fills missing lists with empty arrays', () => {
    const outcome = parseAnalysisReply(validReply);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.memory).toMatchObject({
        summary: 'They talk.',
        keyEvents: [],
        glossary: [],
      });
      expect(outcome.value.cues).toHaveLength(1);
    }
  });

  it('accepts a reply wrapped in a json code fence', () => {
    expect(parseAnalysisReply('```json\n' + validReply + '\n```').ok).toBe(true);
  });

  it('rejects text that is not JSON', () => {
    expect(parseAnalysisReply('Sure! Here it is.')).toEqual({
      ok: false,
      reason: 'reply is not valid JSON',
    });
  });

  it('rejects a reply without a memory summary and names the field, not the content', () => {
    const outcome = parseAnalysisReply(JSON.stringify({ memory: {}, cues: [] }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('memory.summary');
  });

  it('keeps malformed cues as unknown so the memory survives them', () => {
    const outcome = parseAnalysisReply(
      JSON.stringify({ memory: { summary: 'x' }, cues: [{ category: 5 }, 'oops'] }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.cues).toHaveLength(2);
  });

  it('accepts a cue schema with any category string, leaving the check to the validator', () => {
    expect(
      rawCueSchema.safeParse({
        category: 'anything',
        startSentence: 0,
        endSentence: 1,
        intensity: null,
        confidence: 1,
        reason: null,
      }).success,
    ).toBe(true);
  });

  it('requires every cue key, using null for an empty intensity or reason', () => {
    expect(
      rawCueSchema.safeParse({ category: 'light_rain', startSentence: 0, endSentence: 4, confidence: 1 })
        .success,
    ).toBe(false);
  });
});

describe('strict json_schema compatibility of LLM output schemas', () => {
  it.each([
    ['memoryDraftSchema', memoryDraftSchema],
    ['rawCueSchema', rawCueSchema],
    ['analysisResponseSchema', analysisResponseSchema],
  ])('%s requires every key and forbids extra keys at every depth', (_name, schema) => {
    expect(strictViolations(z.toJSONSchema(schema, { io: 'output', reused: 'inline' }))).toEqual(
      [],
    );
  });

  it('the walker flags an optional key and an open object, so the check has teeth', () => {
    const loose = z.object({ a: z.string().optional(), nested: z.object({ b: z.string() }).passthrough() });
    expect(strictViolations(z.toJSONSchema(loose, { io: 'output', reused: 'inline' })).length).toBe(
      2,
    );
  });

  it('strips null-valued keys from a parsed reply, at every depth', () => {
    const clean = stripNulls({
      summary: 'x',
      characters: [{ name: 'Ana', aliases: [], role: null, facts: [] }],
      glossary: [{ term: 'Qi', translation: null, note: 'energy' }],
    });
    expect(clean).toEqual({
      summary: 'x',
      characters: [{ name: 'Ana', aliases: [], facts: [] }],
      glossary: [{ term: 'Qi', note: 'energy' }],
    });
    expect(clean.characters[0]).not.toHaveProperty('role');
  });

  it('maps a nullable reply to the clean domain shape when parsed', () => {
    const reply = JSON.stringify({
      memory: {
        summary: 'They talk.',
        keyEvents: [],
        characters: [{ name: 'Ana', aliases: [], role: null, facts: [] }],
        places: [],
        items: [],
        relationships: [],
        openThreads: [],
        glossary: [{ term: 'Qi', translation: null, note: null }],
      },
      cues: [],
    });
    const outcome = parseAnalysisReply(reply);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.memory.characters[0]).not.toHaveProperty('role');
      expect(outcome.value.memory.glossary).toEqual([{ term: 'Qi' }]);
    }
  });
});

describe('runAnalysisCall repair retry', () => {
  const good = JSON.stringify({ memory: { summary: 'ok' }, cues: [] });

  it('retries once with a repair note after an invalid reply', async () => {
    const calls: { user: string }[] = [];
    const transport = jest.fn(async (req: { system: string; user: string }) => {
      calls.push({ user: req.user });
      return calls.length === 1 ? 'not json' : good;
    });
    const result = await runAnalysisCall(transport, { system: 'S', user: 'U' });
    expect(result.memory.summary).toBe('ok');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(calls[1]?.user).toContain('could not be used (reply is not valid JSON)');
  });

  it('raises a typed error after a second invalid reply', async () => {
    const transport = jest.fn(async () => 'still not json');
    await expect(runAnalysisCall(transport, { system: 'S', user: 'U' })).rejects.toMatchObject({
      code: 'LLM_INVALID_OUTPUT',
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('lets transport errors through without a retry', async () => {
    const transport = jest.fn(async () => {
      throw new Error('network down');
    });
    await expect(runAnalysisCall(transport, { system: 'S', user: 'U' })).rejects.toThrow(
      'network down',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
