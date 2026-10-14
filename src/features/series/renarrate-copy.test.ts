import { renarrateMessage } from './renarrate-copy';

describe('renarrateMessage', () => {
  it('states the narration cost and that the current audio is replaced', () => {
    expect(renarrateMessage({ kind: 'priced', usd: 0.27 })).toBe(
      'About $0.27. The current audio is replaced.',
    );
  });

  it('says the cost is being worked out while it is loading', () => {
    expect(renarrateMessage({ kind: 'loading' })).toBe(
      'Working out the cost. The current audio is replaced.',
    );
  });

  it('says why no price is shown when the catalogue cannot price it', () => {
    expect(renarrateMessage({ kind: 'unknown' })).toBe(
      "Can't price this right now. The current audio is replaced.",
    );
  });
});
