import type { AmbienceCue } from '@/core/domain';

import { activeAmbienceNames, humanizeCategory } from './ambience-names';

function cue(category: string, startSentence: number, endSentence: number, enabled = true): AmbienceCue {
  return {
    id: `${category}-${startSentence}`,
    chapterId: '01HZX00000000000000000000C',
    category,
    startSentence,
    endSentence,
    intensity: 'low',
    fadeInMs: 0,
    fadeOutMs: 0,
    confidence: 0.5,
    reason: 'test',
    enabled,
  };
}

describe('humanizeCategory', () => {
  it('turns a stable id into sentence-case words', () => {
    expect(humanizeCategory('tavern_crowd')).toBe('Tavern crowd');
    expect(humanizeCategory('rain')).toBe('Rain');
  });
});

describe('activeAmbienceNames', () => {
  it('lists the enabled cues that cover the sentence, without repeats', () => {
    const cues = [
      cue('light_rain', 0, 5),
      cue('tavern_crowd', 3, 9),
      cue('light_rain', 4, 6),
      cue('harbor_port', 0, 9, false),
    ];

    expect(activeAmbienceNames(cues, 4)).toEqual(['Light rain', 'Tavern crowd']);
    expect(activeAmbienceNames(cues, 10)).toEqual([]);
  });
});
