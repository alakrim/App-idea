import { sentences } from './__fixtures__/builders';
import { buildCueReport, countDrops, coveragePercent, CueReportSchema } from './cue-report';
import { CUE_DROP_REASONS } from './validate-cues';

import type { ValidatedCue } from './types';
import type { DroppedCue } from './validate-cues';

function cue(startSentence: number, endSentence: number): ValidatedCue {
  return {
    category: 'light_rain',
    startSentence,
    endSentence,
    intensity: 'medium',
    fadeInMs: 2500,
    fadeOutMs: 3000,
    confidence: 0.8,
    reason: 'Rain.',
  };
}

describe('countDrops', () => {
  it('counts every reason, with zero for the ones that did not happen', () => {
    const dropped: DroppedCue[] = [
      { cue: {}, reason: 'too_short' },
      { cue: {}, reason: 'too_short' },
      { cue: {}, reason: 'density_cap' },
    ];
    const counts = countDrops(dropped);
    expect(Object.keys(counts).sort()).toEqual([...CUE_DROP_REASONS].sort());
    expect(counts.too_short).toBe(2);
    expect(counts.density_cap).toBe(1);
    expect(counts.malformed).toBe(0);
  });
});

describe('coveragePercent', () => {
  // Each sentence is 130 characters, about 14 seconds at the Latin rate, so equal weights.
  const ten = sentences(10, 130);

  it('is the share of narration time that at least one cue covers', () => {
    expect(coveragePercent([cue(0, 4)], ten)).toBe(50);
    expect(coveragePercent([cue(0, 4), cue(3, 6)], ten)).toBe(70);
  });

  it('counts a sentence once even when two cues cover it', () => {
    expect(coveragePercent([cue(0, 4), cue(2, 4)], ten)).toBe(50);
  });

  it('is zero with no cues, and null when the chapter has no speech', () => {
    expect(coveragePercent([], ten)).toBe(0);
    expect(coveragePercent([], [])).toBeNull();
  });
});

describe('buildCueReport', () => {
  it('summarises one analysis as counts and flags, never as text', () => {
    const report = buildCueReport({
      model: 'analysis/model',
      promptVersion: 'analysis-v3',
      createdAt: 1_700_000_000_000,
      cues: [cue(0, 4)],
      dropped: [{ cue: { reason: 'the model said something long' }, reason: 'low_confidence' }],
      sentences: sentences(10, 130),
      fallbackRan: true,
      fromCache: false,
    });

    expect(report).toEqual({
      model: 'analysis/model',
      promptVersion: 'analysis-v3',
      createdAt: 1_700_000_000_000,
      accepted: 1,
      droppedByReason: expect.objectContaining({ low_confidence: 1 }),
      coveragePct: 50,
      fallbackRan: true,
      fromCache: false,
    });
    expect(JSON.stringify(report)).not.toContain('the model said');
    expect(CueReportSchema.safeParse(report).success).toBe(true);
  });

  it('rejects a report with an unknown drop reason', () => {
    const report = buildCueReport({
      model: 'm',
      promptVersion: 'v',
      createdAt: 0,
      cues: [],
      dropped: [],
      sentences: [],
      fallbackRan: false,
      fromCache: true,
    });
    const bad = { ...report, droppedByReason: { ...report.droppedByReason, bogus: 1 } };
    expect(CueReportSchema.safeParse(bad).success).toBe(false);
  });
});
