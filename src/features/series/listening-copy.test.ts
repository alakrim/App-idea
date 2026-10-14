import { listeningShortLabel, listeningSpokenLabel } from './listening-copy';

describe('chapter listening copy', () => {
  it('says nothing for a chapter that was never started', () => {
    expect(listeningShortLabel({ kind: 'unstarted' })).toBeNull();
    expect(listeningSpokenLabel({ kind: 'unstarted' })).toBeNull();
  });

  it('says finished for a chapter heard to its end', () => {
    expect(listeningShortLabel({ kind: 'finished' })).toBe('Finished');
    expect(listeningSpokenLabel({ kind: 'finished' })).toBe('finished');
  });

  it('gives the minutes left, short for the row and spelled out for screen readers', () => {
    const progress = { kind: 'in-progress', fraction: 0.5, remainingMs: 12 * 60_000 } as const;

    expect(listeningShortLabel(progress)).toBe('12 min left');
    expect(listeningSpokenLabel(progress)).toBe('12 minutes left');
  });

  it('uses the singular for one minute, and says so when less than a minute is left', () => {
    expect(listeningSpokenLabel({ kind: 'in-progress', fraction: 0.9, remainingMs: 60_000 })).toBe(
      '1 minute left',
    );
    const almost = { kind: 'in-progress', fraction: 1, remainingMs: 20_000 } as const;
    expect(listeningShortLabel(almost)).toBe('Under a minute left');
    expect(listeningSpokenLabel(almost)).toBe('less than a minute left');
  });

  it('says nothing about minutes when the chapter length is unknown', () => {
    const unknown = { kind: 'in-progress', fraction: 0, remainingMs: null } as const;

    expect(listeningShortLabel(unknown)).toBeNull();
    expect(listeningSpokenLabel(unknown)).toBeNull();
  });
});
