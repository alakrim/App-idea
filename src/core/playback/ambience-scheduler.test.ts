import {
  type BedCommand,
  type BedTarget,
  DEFAULT_BED_LEVEL_DB,
  bedGainDb,
  diffBeds,
  planBeds,
} from './ambience-scheduler';

import type { AmbienceCue } from '../domain/analysis';

/** 26-character ULID-shaped ids for fixtures. */
const ULID = (n: number) => `01HZX${String(n).padStart(21, '0')}`;

function cue(overrides: Partial<AmbienceCue> & { id: string }): AmbienceCue {
  return {
    chapterId: ULID(0),
    category: 'light_rain',
    startSentence: 0,
    endSentence: 10,
    intensity: 'medium',
    fadeInMs: 2500,
    fadeOutMs: 3000,
    confidence: 0.8,
    reason: 'test',
    enabled: true,
    ...overrides,
  };
}

/** Applies commands to a set of beds, the way the mixer does, so tests can check the end state. */
function applyCommands(beds: readonly BedTarget[], commands: readonly BedCommand[]): BedTarget[] {
  let state = [...beds];
  for (const command of commands) {
    if (command.type === 'stop') {
      state = state.filter((bed) => bed.cueId !== command.cueId);
    } else if (command.type === 'start') {
      if (state.some((bed) => bed.cueId === command.cueId)) throw new Error('duplicate start');
      state.push({
        cueId: command.cueId,
        category: command.category,
        gainDb: command.gainDb,
        fadeInMs: command.fadeMs,
        fadeOutMs: 3000,
      });
    } else {
      state = state.map((bed) =>
        bed.cueId === command.cueId ? { ...bed, gainDb: command.gainDb } : bed,
      );
    }
  }
  return state;
}

const byId = (beds: readonly BedTarget[]) =>
  [...beds].sort((a, b) => a.cueId.localeCompare(b.cueId));

describe('bedGainDb', () => {
  it('shifts the level by intensity', () => {
    expect(bedGainDb(-22, 'low')).toBe(-25);
    expect(bedGainDb(-22, 'medium')).toBe(-22);
    expect(bedGainDb(-22, 'high')).toBe(-19);
  });

  it('clamps the result to [-30, -12]', () => {
    expect(bedGainDb(-28, 'low')).toBe(-30);
    expect(bedGainDb(-14, 'high')).toBe(-12);
    expect(bedGainDb(-40, 'medium')).toBe(-30);
  });
});

describe('planBeds', () => {
  it('is empty when no cue covers the sentence', () => {
    const cues = [cue({ id: ULID(1), startSentence: 5, endSentence: 9 })];
    expect(planBeds(cues, 4)).toEqual([]);
    expect(planBeds(cues, -1)).toEqual([]);
  });

  it('includes both ends of an inclusive sentence range', () => {
    const cues = [cue({ id: ULID(1), startSentence: 5, endSentence: 9 })];
    expect(planBeds(cues, 5)).toHaveLength(1);
    expect(planBeds(cues, 9)).toHaveLength(1);
    expect(planBeds(cues, 10)).toEqual([]);
  });

  it('ignores disabled cues', () => {
    const cues = [cue({ id: ULID(1), enabled: false })];
    expect(planBeds(cues, 3)).toEqual([]);
  });

  it('keeps at most two beds, preferring higher confidence', () => {
    const cues = [
      cue({ id: ULID(1), confidence: 0.6, category: 'a' }),
      cue({ id: ULID(2), confidence: 0.9, category: 'b' }),
      cue({ id: ULID(3), confidence: 0.7, category: 'c' }),
    ];
    const targets = planBeds(cues, 3);
    expect(targets.map((t) => t.category)).toEqual(['b', 'c']);
  });

  it('breaks confidence ties on the earlier start, then on the id', () => {
    const cues = [
      cue({ id: ULID(3), confidence: 0.8, startSentence: 2, category: 'late' }),
      cue({ id: ULID(2), confidence: 0.8, startSentence: 0, category: 'early' }),
      cue({ id: ULID(1), confidence: 0.8, startSentence: 2, category: 'late-first-id' }),
    ];
    const targets = planBeds(cues, 3);
    expect(targets.map((t) => t.category)).toEqual(['early', 'late-first-id']);
  });

  it('carries the level, fades and intensity into each target', () => {
    const [target] = planBeds([cue({ id: ULID(1), intensity: 'high' })], 3, -24);
    expect(target).toEqual({
      cueId: ULID(1),
      category: 'light_rain',
      gainDb: -21,
      fadeInMs: 2500,
      fadeOutMs: 3000,
    });
  });

  it('defaults to the ADR level of -22 dB', () => {
    const [target] = planBeds([cue({ id: ULID(1), intensity: 'medium' })], 3);
    expect(target?.gainDb).toBe(DEFAULT_BED_LEVEL_DB);
  });
});

describe('diffBeds', () => {
  const bedA: BedTarget = {
    cueId: ULID(1),
    category: 'a',
    gainDb: -22,
    fadeInMs: 2500,
    fadeOutMs: 3000,
  };
  const bedB: BedTarget = {
    cueId: ULID(2),
    category: 'b',
    gainDb: -22,
    fadeInMs: 2500,
    fadeOutMs: 3000,
  };

  it('returns nothing when the beds are unchanged', () => {
    expect(diffBeds([bedA], [bedA])).toEqual([]);
  });

  it('starts new beds with their fade-in', () => {
    expect(diffBeds([], [bedA])).toEqual([
      { type: 'start', cueId: ULID(1), category: 'a', gainDb: -22, fadeMs: 2500 },
    ]);
  });

  it('stops departed beds with their fade-out', () => {
    expect(diffBeds([bedA], [])).toEqual([{ type: 'stop', cueId: ULID(1), fadeMs: 3000 }]);
  });

  it('retargets gain only when it moves', () => {
    const louder = { ...bedA, gainDb: -19 };
    expect(diffBeds([bedA], [louder])).toEqual([
      { type: 'retarget', cueId: ULID(1), gainDb: -19, rampMs: 400 },
    ]);
    expect(diffBeds([bedA], [{ ...bedA, gainDb: -22.004 }])).toEqual([]);
  });

  it('stops before it starts, so a crossfade never exceeds the bed limit', () => {
    const commands = diffBeds([bedA, bedB], [{ ...bedB, cueId: ULID(3), category: 'c' }]);
    expect(commands.map((c) => c.type)).toEqual(['stop', 'stop', 'start']);
  });

  it('restarts a bed whose category changes under the same cue id', () => {
    const commands = diffBeds([bedA], [{ ...bedA, category: 'z' }]);
    expect(commands.map((c) => c.type)).toEqual(['stop', 'start']);
  });

  it('leaves no orphan beds for any pair of target sets', () => {
    const sets: BedTarget[][] = [
      [],
      [bedA],
      [bedB],
      [bedA, bedB],
      [{ ...bedA, gainDb: -18 }],
      [{ ...bedB, cueId: ULID(4), category: 'd' }],
    ];
    for (const prev of sets) {
      for (const next of sets) {
        const result = applyCommands(prev, diffBeds(prev, next));
        expect(byId(result)).toEqual(byId(next));
      }
    }
  });

  it('handles a seek that jumps across cue boundaries', () => {
    const cues = [
      cue({
        id: ULID(1),
        startSentence: 0,
        endSentence: 4,
        category: 'forest_night',
        confidence: 0.9,
      }),
      cue({
        id: ULID(2),
        startSentence: 10,
        endSentence: 20,
        category: 'city_night',
        confidence: 0.9,
      }),
    ];
    const inFirst = planBeds(cues, 2);
    const afterFirst = planBeds(cues, 8);
    const inSecond = planBeds(cues, 15);

    const seekPastEnd = applyCommands(inFirst, diffBeds(inFirst, afterFirst));
    expect(seekPastEnd).toEqual([]);

    const seekIntoSecond = applyCommands(seekPastEnd, diffBeds(seekPastEnd, inSecond));
    expect(seekIntoSecond.map((b) => b.category)).toEqual(['city_night']);
  });
});
