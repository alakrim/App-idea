import { nameKeys, normalizeName, resolveEntities } from './entities';
import {
  emptyMemory,
  entity,
  fact,
  CHAPTER_ID,
  SERIES_ID,
} from '../analysis/__fixtures__/builders';

let counter = 0;
const newId = (): string => `ID${String(++counter).padStart(4, '0')}`;

beforeEach(() => {
  counter = 0;
});

describe('normalizeName', () => {
  it('folds case and collapses whitespace', () => {
    expect(normalizeName('  The   Hound  ')).toBe('the hound');
  });

  it('removes diacritics from Latin letters', () => {
    expect(normalizeName('José Ñandú')).toBe('jose nandu');
    expect(normalizeName('Zoë')).toBe(normalizeName('Zoe'));
  });

  it('applies NFKC for full-width and half-width forms', () => {
    expect(normalizeName('ＬＹＮＮ')).toBe('lynn');
    expect(normalizeName('ﾔﾏﾀﾞ')).toBe(normalizeName('ヤマダ'));
  });

  it('casefolds German sharp s', () => {
    expect(normalizeName('Straße')).toBe('strasse');
  });

  it('leaves CJK text as NFKC makes it, with no diacritic stripping', () => {
    // Full-width and ideographic spaces are not ideographs, so they collapse. Kana keep their dakuten.
    expect(normalizeName('李明')).toBe('李明');
    expect(normalizeName('ガ')).toBe('ガ');
    expect(normalizeName('가나다')).toBe('가나다');
  });

  it('keeps a combining mark after a non-Latin letter', () => {
    const decomposed = 'が';
    expect(normalizeName(decomposed)).toBe('が');
  });
});

describe('nameKeys', () => {
  it('returns distinct normalized keys for the name and its aliases', () => {
    expect(nameKeys('Ana Ruiz', ['ana', 'Anita', ''])).toEqual(['ana ruiz', 'ana', 'anita']);
  });
});

describe('resolveEntities', () => {
  it('creates an entity for each new character, place and item, with its first chapter order', () => {
    const memory = emptyMemory({
      characters: [{ name: 'Ana', aliases: [], facts: ['is a pilot'] }],
      places: [{ name: 'Port Nadal', facts: ['a harbour'] }],
      items: [{ name: 'The Brass Key', facts: [] }],
    });
    const { upserts, newFacts } = resolveEntities([], memory, 3, { seriesId: SERIES_ID, newId });

    expect(upserts.map((e) => [e.kind, e.canonicalName, e.firstChapterOrder, e.seriesId])).toEqual([
      ['character', 'Ana', 3, SERIES_ID],
      ['place', 'Port Nadal', 3, SERIES_ID],
      ['item', 'The Brass Key', 3, SERIES_ID],
    ]);
    expect(newFacts.map((f) => [f.fact, f.chapterOrder, f.chapterId])).toEqual([
      ['is a pilot', 3, CHAPTER_ID],
      ['a harbour', 3, CHAPTER_ID],
    ]);
  });

  it('matches an existing entity by alias and records the new spelling as an alias', () => {
    const existing = [entity({ id: 'E1', canonicalName: 'Ana Ruiz', aliases: ['Ana'] })];
    const memory = emptyMemory({
      characters: [{ name: 'La Capitana', aliases: ['Ana Ruiz'], facts: ['commands the ship'] }],
    });
    const { upserts, newFacts } = resolveEntities(existing, memory, 5, {
      seriesId: SERIES_ID,
      newId,
    });

    expect(upserts).toEqual([
      expect.objectContaining({
        id: 'E1',
        canonicalName: 'Ana Ruiz',
        aliases: ['Ana', 'La Capitana'],
      }),
    ]);
    expect(newFacts).toEqual([
      expect.objectContaining({ entityId: 'E1', fact: 'commands the ship', chapterOrder: 5 }),
    ]);
  });

  it('matches across diacritics and width, and keeps the earliest first-chapter order', () => {
    const existing = [
      entity({ id: 'E1', canonicalName: 'José Plaza', kind: 'place', firstChapterOrder: 4 }),
    ];
    const memory = emptyMemory({
      places: [{ name: 'Jose Plaza', facts: ['a fountain'] }],
    });
    const { upserts } = resolveEntities(existing, memory, 2, { seriesId: SERIES_ID, newId });
    // Diacritic variants share one normalized key, so no new alias is stored.
    expect(upserts).toEqual([
      expect.objectContaining({ id: 'E1', firstChapterOrder: 2, aliases: [] }),
    ]);
  });

  it('matches CJK names by their NFKC form', () => {
    const existing = [entity({ id: 'E1', canonicalName: 'ヤマダ' })];
    const memory = emptyMemory({
      characters: [{ name: 'ﾔﾏﾀﾞ', aliases: [], facts: ['a doctor'] }],
    });
    const { upserts, newFacts } = resolveEntities(existing, memory, 1, {
      seriesId: SERIES_ID,
      newId,
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.id).toBe('E1');
    expect(newFacts[0]?.entityId).toBe('E1');
  });

  it('never matches across kinds: a character and a place with the same name stay separate', () => {
    const existing = [entity({ id: 'E1', canonicalName: 'Rome', kind: 'character' })];
    const memory = emptyMemory({ places: [{ name: 'Rome', facts: ['an old city'] }] });
    const { upserts } = resolveEntities(existing, memory, 1, { seriesId: SERIES_ID, newId });
    expect(upserts).toEqual([expect.objectContaining({ kind: 'place', canonicalName: 'Rome' })]);
    expect(upserts[0]?.id).not.toBe('E1');
  });

  it('merges repeated mentions inside one memory into a single entity', () => {
    const memory = emptyMemory({
      characters: [
        { name: 'Bo', aliases: [], facts: ['a sailor'] },
        { name: 'bo', aliases: ['Boris'], facts: ['a sailor', 'quiet'] },
      ],
    });
    const { upserts, newFacts } = resolveEntities([], memory, 1, { seriesId: SERIES_ID, newId });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.aliases).toEqual(['Boris']);
    expect(newFacts.map((f) => f.fact)).toEqual(['a sailor', 'quiet']);
  });

  it('drops facts that already exist for the series', () => {
    const existing = [entity({ id: 'E1', canonicalName: 'Ana' })];
    const stored = [fact({ id: 'F1', entityId: 'E1', fact: 'is a pilot', chapterOrder: 1 })];
    const memory = emptyMemory({
      characters: [{ name: 'Ana', aliases: [], facts: ['Is a pilot', 'flies at night'] }],
    });
    const { newFacts } = resolveEntities(existing, memory, 2, {
      seriesId: SERIES_ID,
      newId,
      existingFacts: stored,
    });
    expect(newFacts.map((f) => f.fact)).toEqual(['flies at night']);
  });

  it('returns only the entities this chapter touched', () => {
    const existing = [
      entity({ id: 'E1', canonicalName: 'Ana' }),
      entity({ id: 'E2', canonicalName: 'Bo' }),
    ];
    const memory = emptyMemory({ characters: [{ name: 'Ana', aliases: [], facts: [] }] });
    const { upserts } = resolveEntities(existing, memory, 2, { seriesId: SERIES_ID, newId });
    expect(upserts.map((e) => e.id)).toEqual(['E1']);
  });

  it('does not mutate the input entities', () => {
    const existing = [entity({ id: 'E1', canonicalName: 'Ana', aliases: ['A'] })];
    const memory = emptyMemory({ characters: [{ name: 'Ana Ruiz', aliases: [], facts: [] }] });
    resolveEntities(existing, memory, 1, { seriesId: SERIES_ID, newId });
    expect(existing[0]).toEqual(entity({ id: 'E1', canonicalName: 'Ana', aliases: ['A'] }));
  });
});
