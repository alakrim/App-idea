import { createBlockedCopy } from './create-gate-copy';

import type { CreateGate } from './source-state';

const ready: CreateGate = {
  mode: 'link',
  linkReady: true,
  hasFile: false,
  textLength: 0,
  title: 'Chapter one',
  creating: false,
};

describe('createBlockedCopy', () => {
  it('says nothing when Create is on', () => {
    expect(createBlockedCopy(ready)).toBeNull();
    expect(createBlockedCopy({ ...ready, mode: 'pdf', hasFile: true })).toBeNull();
    expect(createBlockedCopy({ ...ready, mode: 'text', textLength: 4 })).toBeNull();
  });

  it('names the missing source for each mode', () => {
    expect(createBlockedCopy({ ...ready, linkReady: false })).toBe(
      'Paste a link to a page with readable text.',
    );
    expect(createBlockedCopy({ ...ready, mode: 'pdf', hasFile: false })).toBe(
      'Choose a PDF to create the chapter.',
    );
    expect(createBlockedCopy({ ...ready, mode: 'text', textLength: 0 })).toBe(
      'Paste the text to create the chapter.',
    );
  });

  it('asks for a title once the source is fine', () => {
    expect(createBlockedCopy({ ...ready, title: '   ' })).toBe(
      'Add a title to create the chapter.',
    );
  });

  it('says nothing while the chapter is being created', () => {
    expect(createBlockedCopy({ ...ready, linkReady: false, creating: true })).toBeNull();
  });
});
