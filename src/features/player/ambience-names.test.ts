import type { AmbienceCue } from '@/core/domain';

import { activeAmbience } from './ambience-names';

function cue(
  category: string,
  startSentence: number,
  endSentence: number,
  enabled = true,
): AmbienceCue {
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

describe('activeAmbience', () => {
  it('lists the enabled cues that cover the sentence, once per category, with label and icon', () => {
    const cues = [
      cue('light_rain', 0, 5),
      cue('tavern_crowd', 3, 9),
      cue('light_rain', 4, 6),
      cue('harbor_port', 0, 9, false),
    ];

    expect(activeAmbience(cues, 4)).toEqual([
      { id: 'light_rain', label: 'Light Rain', icon: 'CloudDrizzle' },
      { id: 'tavern_crowd', label: 'Tavern', icon: 'Wine' },
    ]);
    expect(activeAmbience(cues, 10)).toEqual([]);
  });

  it('keeps an unknown category with no icon, so the chip can still name it', () => {
    expect(activeAmbience([cue('unknown_thing', 0, 2)], 1)).toEqual([
      { id: 'unknown_thing', label: 'Unknown thing', icon: null },
    ]);
  });
});
