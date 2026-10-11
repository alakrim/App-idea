import { getCategory, type AmbienceIconName } from '@/core/analysis/ambience-taxonomy';
import type { AmbienceCue } from '@/core/domain';
import { ambienceLabel } from '@/features/shared/ambience-display';

export interface ActiveAmbience {
  /** The category id, unique within the list. */
  id: string;
  label: string;
  icon: AmbienceIconName | null;
}

/** The enabled cues sounding at a sentence, one entry per category, in cue order. */
export function activeAmbience(cues: readonly AmbienceCue[], sentenceIdx: number): ActiveAmbience[] {
  const active: ActiveAmbience[] = [];
  for (const cue of cues) {
    if (!cue.enabled || sentenceIdx < cue.startSentence || sentenceIdx > cue.endSentence) continue;
    if (active.some((entry) => entry.id === cue.category)) continue;
    active.push({
      id: cue.category,
      label: ambienceLabel(cue.category),
      icon: getCategory(cue.category)?.icon ?? null,
    });
  }
  return active;
}
