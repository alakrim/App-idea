import { mergeMemoryDrafts } from './merge-memory';

import type { MemoryFields } from './types';

const BASE: MemoryFields = {
  summary: '',
  keyEvents: [],
  characters: [],
  places: [],
  items: [],
  relationships: [],
  openThreads: [],
  glossary: [],
};

function draft(overrides: Partial<MemoryFields>): MemoryFields {
  return { ...BASE, ...overrides };
}

describe('mergeMemoryDrafts', () => {
  it('returns an empty memory for no chunks', () => {
    expect(mergeMemoryDrafts([])).toEqual(BASE);
  });

  it('unions characters by name or alias, merging facts and aliases', () => {
    const merged = mergeMemoryDrafts([
      draft({ characters: [{ name: 'Ana Ruiz', aliases: ['Ana'], facts: ['is a pilot'] }] }),
      draft({
        characters: [
          {
            name: 'Ana',
            aliases: ['La Capitana'],
            role: 'captain',
            facts: ['is a pilot', 'flies at dawn'],
          },
        ],
      }),
    ]);
    expect(merged.characters).toEqual([
      {
        name: 'Ana Ruiz',
        aliases: ['Ana', 'La Capitana'],
        role: 'captain',
        facts: ['is a pilot', 'flies at dawn'],
      },
    ]);
  });

  it('matches across diacritics and full-width forms', () => {
    const merged = mergeMemoryDrafts([
      draft({ places: [{ name: 'José Plaza', facts: ['a fountain'] }] }),
      draft({ places: [{ name: 'Jose Plaza', facts: ['a bench'] }] }),
      draft({ items: [{ name: 'ＡＢＣ Key', facts: [] }] }),
      draft({ items: [{ name: 'ABC Key', facts: ['brass'] }] }),
    ]);
    expect(merged.places).toEqual([{ name: 'José Plaza', facts: ['a fountain', 'a bench'] }]);
    // The first spelling is kept as written.
    expect(merged.items).toEqual([{ name: 'ＡＢＣ Key', facts: ['brass'] }]);
  });

  it('matches CJK names that differ only by NFKC width (half-width katakana)', () => {
    const merged = mergeMemoryDrafts([
      draft({ characters: [{ name: 'ヤマダ', aliases: [], facts: ['医者'] }] }),
      draft({ characters: [{ name: 'ﾔﾏﾀﾞ', aliases: [], facts: ['学生'] }] }),
    ]);
    expect(merged.characters).toHaveLength(1);
    expect(merged.characters[0]?.facts).toEqual(['医者', '学生']);
  });

  it('samples key events evenly across chunks and keeps reading order at the cap', () => {
    const first = Array.from({ length: 6 }, (_, i) => `first ${i}`);
    const second = Array.from({ length: 6 }, (_, i) => `second ${i}`);
    const merged = mergeMemoryDrafts([draft({ keyEvents: first }), draft({ keyEvents: second })]);
    expect(merged.keyEvents).toEqual([...first.slice(0, 5), ...second.slice(0, 5)]);
  });

  it('does not let one long chunk crowd out the others when key events are capped', () => {
    const merged = mergeMemoryDrafts([
      draft({ keyEvents: ['A only'] }),
      draft({ keyEvents: Array.from({ length: 8 }, (_, i) => `B${i}`) }),
      draft({ keyEvents: Array.from({ length: 8 }, (_, i) => `C${i}`) }),
    ]);
    expect(merged.keyEvents).toHaveLength(10);
    expect(merged.keyEvents).toEqual([
      'A only',
      'B0',
      'B1',
      'B2',
      'B3',
      'B4',
      'C0',
      'C1',
      'C2',
      'C3',
    ]);
  });

  it('keeps every key event when the chunks together fit under the cap', () => {
    const merged = mergeMemoryDrafts([
      draft({ keyEvents: ['Ana leaves', 'Ana returns'] }),
      draft({ keyEvents: ['Bo arrives'] }),
    ]);
    expect(merged.keyEvents).toEqual(['Ana leaves', 'Ana returns', 'Bo arrives']);
  });

  it('skips a key event that repeats in a later chunk and fills the slot from the next item', () => {
    const merged = mergeMemoryDrafts([
      draft({ keyEvents: ['Storm hits', 'Boat sinks'] }),
      draft({ keyEvents: ['storm HITS', 'Rescue begins'] }),
    ]);
    expect(merged.keyEvents).toEqual(['Storm hits', 'Boat sinks', 'Rescue begins']);
  });

  it('takes open threads from the last chunk', () => {
    const merged = mergeMemoryDrafts([
      draft({ openThreads: ['early?'] }),
      draft({ openThreads: ['late?'] }),
    ]);
    expect(merged.openThreads).toEqual(['late?']);
  });

  it('dedupes relationships and glossary terms, filling missing translations', () => {
    const merged = mergeMemoryDrafts([
      draft({
        relationships: [{ a: 'Ana', b: 'Bo', nature: 'sister' }],
        glossary: [{ term: 'Qi', note: 'energy' }],
      }),
      draft({
        relationships: [
          { a: 'ana', b: 'bo', nature: 'Sister' },
          { a: 'Ana', b: 'Cy', nature: 'rival' },
        ],
        glossary: [{ term: 'QI', translation: 'energia' }],
      }),
    ]);
    expect(merged.relationships).toEqual([
      { a: 'Ana', b: 'Bo', nature: 'sister' },
      { a: 'Ana', b: 'Cy', nature: 'rival' },
    ]);
    expect(merged.glossary).toEqual([{ term: 'Qi', translation: 'energia', note: 'energy' }]);
  });

  it('joins the chunk summaries and caps them at 120 words', () => {
    const long = Array.from({ length: 80 }, () => 'word').join(' ');
    const merged = mergeMemoryDrafts([draft({ summary: long }), draft({ summary: long })]);
    expect(merged.summary.split(' ')).toHaveLength(120);
  });

  it('caps characters at 15 across chunks', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      name: `Name ${i}`,
      aliases: [],
      facts: [],
    }));
    const merged = mergeMemoryDrafts([
      draft({ characters: many }),
      draft({ characters: many.map((c) => ({ ...c, name: `${c.name}x` })) }),
    ]);
    expect(merged.characters).toHaveLength(15);
  });
});
