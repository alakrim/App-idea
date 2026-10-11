import { SELECTION_PROMPT_VERSION, SELECTION_SYSTEM_PROMPT } from './prompts';
import {
  MAX_DROPPED_CHAR_SHARE,
  PROMPT_BLOCK_CHARS,
  applySelection,
  buildSelectionPrompt,
  parseSelectionResponse,
  selectionSchema,
} from './select';
import type { Block } from './types';

const p = (text: string): Block => ({ tag: 'p', text });

describe('prompt version and system prompt', () => {
  it('exports a versioned prompt that asks for a keep object', () => {
    expect(SELECTION_PROMPT_VERSION).toBe('index-select-v1');
    expect(SELECTION_SYSTEM_PROMPT).toContain('{"keep"');
    expect(SELECTION_SYSTEM_PROMPT).toContain('Never rewrite');
  });
});

describe('buildSelectionPrompt', () => {
  it('numbers each block and includes the title and language hint', () => {
    const { system, user } = buildSelectionPrompt([p('First block.'), p('Second block.')], {
      title: 'Harbour storm',
      lang: 'en',
    });
    expect(system).toBe(SELECTION_SYSTEM_PROMPT);
    expect(user).toBe(
      ['Title: Harbour storm', 'Language hint: en', 'Blocks:', '[0] First block.', '[1] Second block.'].join(
        '\n',
      ),
    );
  });

  it('uses placeholders when the title and language are unknown', () => {
    const { user } = buildSelectionPrompt([p('Only block.')]);
    expect(user.split('\n').slice(0, 2)).toEqual(['Title: unknown', 'Language hint: unknown']);
  });

  it(`truncates each block to ${PROMPT_BLOCK_CHARS} characters without splitting a CJK character`, () => {
    const long = '夜'.repeat(PROMPT_BLOCK_CHARS + 50);
    const { user } = buildSelectionPrompt([p(long)]);
    const line = user.split('\n').find((row) => row.startsWith('[0] ')) ?? '';
    expect(line).toBe(`[0] ${'夜'.repeat(PROMPT_BLOCK_CHARS)}…`);
  });

  it('leaves a block that fits the limit unchanged', () => {
    const exact = 'a'.repeat(PROMPT_BLOCK_CHARS);
    const { user } = buildSelectionPrompt([p(exact)]);
    expect(user).toContain(`[0] ${exact}`);
    expect(user).not.toContain('…');
  });
});

describe('selectionSchema and parseSelectionResponse', () => {
  it('accepts a plain keep object', () => {
    expect(parseSelectionResponse('{"keep": [0, 2, 5]}')).toEqual({ keep: [0, 2, 5] });
  });

  it('accepts a reply wrapped in a Markdown code fence', () => {
    expect(parseSelectionResponse('```json\n{"keep": [1]}\n```')).toEqual({ keep: [1] });
  });

  it.each([
    ['prose around the JSON', 'Here you go: {"keep": [0]}'],
    ['a bare array', '[0, 1, 2]'],
    ['a float index', '{"keep": [0.5]}'],
    ['a negative index', '{"keep": [-1]}'],
    ['a string index', '{"keep": ["0"]}'],
    ['truncated JSON', '{"keep": [0, 1'],
    ['an empty reply', ''],
  ])('rejects %s', (_label, raw) => {
    expect(parseSelectionResponse(raw)).toBeNull();
  });

  it('exposes the schema for callers that validate directly', () => {
    expect(selectionSchema.safeParse({ keep: [0] }).success).toBe(true);
    expect(selectionSchema.safeParse({}).success).toBe(false);
  });
});

describe('applySelection', () => {
  const blocks = [p('Alpha narrative line.'), p('Beta narrative line.'), p('Gamma narrative line.')];

  it('keeps the selected blocks in their original order', () => {
    const outcome = applySelection(blocks, [2, 0]);
    expect(outcome).toEqual({
      blocks: [blocks[0], blocks[2]],
      applied: true,
      warning: null,
    });
  });

  it('ignores out-of-range and duplicate indices', () => {
    const outcome = applySelection(blocks, [0, 0, 1, 9, 100]);
    expect(outcome.blocks).toEqual([blocks[0], blocks[1]]);
    expect(outcome.applied).toBe(true);
  });

  it('refuses a selection that drops more than 70% of the characters', () => {
    // Keeping only the 6-character block out of ~60 characters drops about 90%.
    const big = [p('x'.repeat(50)), p('y'.repeat(50)), p('short')];
    const outcome = applySelection(big, [2]);
    expect(outcome.applied).toBe(false);
    expect(outcome.warning).toBe('selection_dropped_too_much');
    expect(outcome.blocks).toEqual(big);
  });

  it('accepts a selection that drops exactly 70% of the characters', () => {
    const big = [p('a'.repeat(30)), p('b'.repeat(70))];
    expect(MAX_DROPPED_CHAR_SHARE).toBe(0.7);
    // Keeping the 30-character block drops exactly 70 of 100 characters, which is allowed.
    const outcome = applySelection(big, [0]);
    expect(outcome.applied).toBe(true);
    expect(outcome.blocks).toEqual([big[0]]);
  });

  it('refuses an empty selection of a non-empty chapter, and returns a copy of the input', () => {
    const outcome = applySelection(blocks, []);
    expect(outcome.applied).toBe(false);
    expect(outcome.blocks).toEqual(blocks);
    expect(outcome.blocks).not.toBe(blocks);
  });

  it('applies an empty selection to an empty chapter', () => {
    expect(applySelection([], [])).toEqual({ blocks: [], applied: true, warning: null });
  });
});
