import { ANALYSIS_SAMPLING, CUE_LIMITS } from './limits';
import { SETTING_FALLBACK_JSON_SCHEMA } from './schemas';
import { needsSettingFallback, parseSettingFallback, runSettingFallback } from './setting-fallback';
import { strictViolations } from '../__fixtures__/strict-json-schema';
import { reply } from '../llm/__fixtures__/replies';

import type { MemoryFields } from './types';
import type { LlmRequest, LlmTransport } from '../llm/transport';

const MEMORY: MemoryFields = {
  summary: 'The crew sails through a storm.',
  keyEvents: ['The mast breaks.'],
  characters: [],
  places: [{ name: 'the Gull', facts: [] }],
  items: [],
  relationships: [],
  openThreads: [],
  glossary: [],
};

describe('needsSettingFallback', () => {
  it('runs only for a chapter with no valid cue and at least 200 words', () => {
    expect(needsSettingFallback(0, CUE_LIMITS.minWordsForCues, 12)).toBe(true);
    expect(needsSettingFallback(0, 5_000, 40)).toBe(true);
  });

  it('does not run under 200 words', () => {
    expect(needsSettingFallback(0, CUE_LIMITS.minWordsForCues - 1, 12)).toBe(false);
  });

  it('does not run when a cue survived', () => {
    expect(needsSettingFallback(1, 5_000, 40)).toBe(false);
  });

  it('does not run for an empty chapter', () => {
    expect(needsSettingFallback(0, 5_000, 0)).toBe(false);
  });
});

describe('parseSettingFallback', () => {
  const bed = {
    cue: { category: 'tavern_crowd', intensity: 'low', confidence: 0.6, reason: 'A busy inn.' },
  };

  it('turns a named bed into a raw cue spanning the whole chapter', () => {
    expect(parseSettingFallback(JSON.stringify(bed), 12)).toEqual({
      category: 'tavern_crowd',
      startSentence: 0,
      endSentence: 11,
      intensity: 'low',
      confidence: 0.6,
      reason: 'A busy inn.',
    });
  });

  it('accepts a reply in a code fence', () => {
    expect(parseSettingFallback('```json\n' + JSON.stringify(bed) + '\n```', 12)).not.toBeNull();
  });

  it('returns null when the model names no setting', () => {
    expect(parseSettingFallback('{"cue": null}', 12)).toBeNull();
  });

  it('returns null for a reply that is not JSON, or does not match the schema', () => {
    expect(parseSettingFallback('a tavern, I think', 12)).toBeNull();
    expect(parseSettingFallback('{"cue": {"category": "tavern_crowd"}}', 12)).toBeNull();
    expect(parseSettingFallback('{}', 12)).toBeNull();
  });
});

describe('runSettingFallback', () => {
  it('makes exactly one call, with the fallback schema and fixed sampling', async () => {
    const calls: LlmRequest[] = [];
    const transport: LlmTransport = async (request) => {
      calls.push(request);
      return reply('{"cue": null}');
    };

    const result = await runSettingFallback(transport, {
      chapterTitle: 'Chapter 3',
      memory: MEMORY,
      sentenceCount: 12,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.jsonSchema).toBe(SETTING_FALLBACK_JSON_SCHEMA);
    expect(calls[0]).toMatchObject(ANALYSIS_SAMPLING);
    expect(calls[0]?.user).toContain('Summary: The crew sails through a storm.');
    expect(result.rawCue).toBeNull();
    expect(result.usage.promptTokens).toBeGreaterThan(0);
  });

  it('returns the raw whole-chapter cue for a named bed', async () => {
    const transport: LlmTransport = async () =>
      reply(
        JSON.stringify({
          cue: { category: 'ship_deck', intensity: null, confidence: 0.5, reason: null },
        }),
      );

    const result = await runSettingFallback(transport, {
      chapterTitle: 'C',
      memory: MEMORY,
      sentenceCount: 5,
    });

    expect(result.rawCue).toMatchObject({
      category: 'ship_deck',
      startSentence: 0,
      endSentence: 4,
      intensity: null,
      reason: null,
    });
  });

  it('keeps the fallback schema strict, so the provider must return exactly its keys', () => {
    expect(strictViolations(SETTING_FALLBACK_JSON_SCHEMA.schema)).toEqual([]);
  });
});
