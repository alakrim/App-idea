import { chapterEraOf } from './chapter-era';

describe('chapterEraOf', () => {
  it('returns null when no passage names an era', () => {
    expect(chapterEraOf([])).toBeNull();
    expect(chapterEraOf([null, null])).toBeNull();
  });

  it('returns the only era named', () => {
    expect(chapterEraOf([null, 'historic', null])).toBe('historic');
  });

  it('returns the most common era, ignoring passages with no era', () => {
    expect(chapterEraOf(['historic', null, 'modern', 'historic'])).toBe('historic');
  });

  it('breaks a tie in favour of the era that appears first in the chapter', () => {
    expect(chapterEraOf(['modern', 'historic', 'historic', 'modern'])).toBe('modern');
    expect(chapterEraOf(['historic', 'modern'])).toBe('historic');
  });

  it('is independent of map order: the same passages always give the same era', () => {
    const passages = ['timeless', 'historic', 'timeless', 'historic'] as const;
    expect(chapterEraOf(passages)).toBe('timeless');
    expect(chapterEraOf([...passages].reverse())).toBe('historic');
  });
});
