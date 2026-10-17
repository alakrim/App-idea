/*
 * QA-F proof (P1, spoiler). The codex is filtered by each entity's first chapter, but an entity's
 * alias list carries no chapter stamp. An alias first revealed in chapter 9 therefore appears in the
 * prior context for a reader at cutoff 3. This test fails until aliases are stored with the chapter
 * that revealed them (entity_aliases, filtered by cutoff).
 */

import { buildPriorContext } from './codex';
import { resolveEntities } from './entities';
import { emptyMemory, entity, fact } from '../analysis/__fixtures__/builders';

describe('QA-F audit: alias spoiler at a cutoff', () => {
  it('does not show an alias first revealed after the cutoff', () => {
    const jon = entity({ id: 'jon', canonicalName: 'Jon', firstChapterOrder: 1 });
    const jonFact = fact({
      id: 'jon-fact-1',
      entityId: 'jon',
      fact: 'Lives at Winterfell.',
      chapterOrder: 1,
    });
    // Chapter 9 reveals that Jon is also called "The Prince".
    const chapterNine = emptyMemory({
      characters: [{ name: 'Jon', aliases: ['The Prince'], facts: [] }],
    });

    const resolution = resolveEntities([jon], chapterNine, 9, {
      seriesId: jon.seriesId,
      existingFacts: [jonFact],
    });
    const prior = buildPriorContext(resolution.upserts, [jonFact], [], 3, 10_000);

    // Positive control: the entity is visible at cutoff 3, so the check below is not vacuous.
    expect(prior).toContain('Jon');
    expect(prior).not.toContain('The Prince');
  });
});
