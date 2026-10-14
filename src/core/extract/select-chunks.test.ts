import { applySelection, chunkForSelection, PROMPT_BLOCK_CHARS } from './select';

import type { Block } from './types';

const block = (text: string): Block => ({ tag: 'p', text });

describe('chunkForSelection', () => {
  it('drops blocks with no text, and keeps each survivor at its index in the page', () => {
    const blocks = [block('First.'), block('   '), block('Third.')];

    const chunks = chunkForSelection(blocks);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.map((item) => [item.index, item.block.text])).toEqual([
      [0, 'First.'],
      [2, 'Third.'],
    ]);
  });

  it('starts a new chunk when the prompt would pass the token budget', () => {
    const text = 'word '.repeat(60); // about 75 tokens once cut and counted
    const blocks = Array.from({ length: 10 }, () => block(text));

    const chunks = chunkForSelection(blocks, 200);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat().map((item) => item.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const chunk of chunks) expect(chunk.length).toBeLessThan(10);
  });

  it('never splits a single block, even one longer than the budget', () => {
    const huge = block('x'.repeat(PROMPT_BLOCK_CHARS * 10));

    const chunks = chunkForSelection([huge], 10);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(1);
  });

  it('gives an empty result for a page with no text', () => {
    expect(chunkForSelection([block(''), block('  ')])).toEqual([]);
  });

  it('maps chunk-local keep positions back to page indices with applySelection', () => {
    const blocks = Array.from({ length: 6 }, (_, n) => block(`Block ${n} says something long enough.`));
    const chunks = chunkForSelection(blocks, 40);
    // Keep the first block of every chunk, as a model answering each chunk would.
    const keep = chunks.map((chunk) => chunk[0]?.index ?? -1);
    const kept = applySelection(blocks, keep);

    expect(kept.applied).toBe(true);
    expect(kept.blocks.map((b) => b.text)).toEqual(keep.map((i) => blocks[i]?.text));
  });
});
