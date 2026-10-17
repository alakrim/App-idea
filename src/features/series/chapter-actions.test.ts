import {
  chapterActionFrom,
  chapterActionsFor,
  chapterAvailability,
  type ChapterActionFacts,
} from './chapter-actions';

const facts = (overrides: Partial<ChapterActionFacts> = {}): ChapterActionFacts => ({
  index: 1,
  count: 3,
  status: 'ready',
  processing: false,
  ...overrides,
});

describe('chapterAvailability', () => {
  it('allows moving up or down only inside the series', () => {
    expect(chapterAvailability(facts({ index: 0 }))).toMatchObject({
      canMoveUp: false,
      canMoveDown: true,
    });
    expect(chapterAvailability(facts({ index: 2 }))).toMatchObject({
      canMoveUp: true,
      canMoveDown: false,
    });
  });

  it('allows re-generating only a finished chapter', () => {
    expect(chapterAvailability(facts({ status: 'ready' })).canRegenerate).toBe(true);
    expect(chapterAvailability(facts({ status: 'draft' })).canRegenerate).toBe(false);
    expect(chapterAvailability(facts({ status: 'failed' })).canRegenerate).toBe(false);
  });

  it('allows stopping only while the chapter is being prepared', () => {
    expect(chapterAvailability(facts({ processing: true })).canStop).toBe(true);
    expect(chapterAvailability(facts({ processing: false })).canStop).toBe(false);
  });
});

describe('chapterActionsFor', () => {
  it('lists every available action in menu order, with delete last', () => {
    const actions = chapterActionsFor({
      canMoveUp: true,
      canMoveDown: true,
      canRegenerate: true,
      canStop: true,
    });
    expect(actions).toEqual(['move-up', 'move-down', 're-generate', 'stop', 'delete']);
  });

  it('drops the actions a chapter cannot take, but keeps delete', () => {
    const actions = chapterActionsFor({
      canMoveUp: false,
      canMoveDown: false,
      canRegenerate: false,
      canStop: false,
    });
    expect(actions).toEqual(['delete']);
  });

  it('offers stop, not re-generate, while a chapter is being prepared', () => {
    const actions = chapterActionsFor(
      chapterAvailability(facts({ status: 'processing', processing: true })),
    );
    expect(actions).toContain('stop');
    expect(actions).not.toContain('re-generate');
  });
});

describe('chapterActionFrom', () => {
  it('accepts every chapter action name', () => {
    expect(chapterActionFrom('move-up')).toBe('move-up');
    expect(chapterActionFrom('delete')).toBe('delete');
  });

  it('rejects any other name', () => {
    expect(chapterActionFrom('rename')).toBeNull();
    expect(chapterActionFrom('')).toBeNull();
  });
});
