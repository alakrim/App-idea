import { aliasesBefore, aliasesThrough } from './aliases';

const jon = {
  aliases: [
    { alias: 'Jon Snow', firstChapterOrder: 1 },
    { alias: 'The Prince', firstChapterOrder: 9 },
  ],
};

describe('aliasesBefore', () => {
  it('leaves out a spelling first revealed at the cutoff chapter or later', () => {
    expect(aliasesBefore(jon, 3)).toEqual(['Jon Snow']);
    expect(aliasesBefore(jon, 9)).toEqual(['Jon Snow']);
  });

  it('includes every spelling once the cutoff is past its reveal', () => {
    expect(aliasesBefore(jon, 10)).toEqual(['Jon Snow', 'The Prince']);
  });
});

describe('aliasesThrough', () => {
  it('includes a spelling revealed in the same chapter, and hides later ones', () => {
    expect(aliasesThrough(jon, 9)).toEqual(['Jon Snow', 'The Prince']);
    expect(aliasesThrough(jon, 8)).toEqual(['Jon Snow']);
  });
});
