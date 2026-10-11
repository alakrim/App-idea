import type { AmbienceCue } from '@/core/domain';

/**
 * Ambience category ids to words for the player, such as "tavern_crowd" to "Tavern crowd". The ids
 * are stable and stored, so only the display text changes here.
 */
export function humanizeCategory(categoryId: string): string {
  const words = categoryId
    .split('_')
    .filter((word) => word.length > 0)
    .join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The enabled cues sounding at a sentence, as unique display names in cue order. */
export function activeAmbienceNames(cues: readonly AmbienceCue[], sentenceIdx: number): string[] {
  const names: string[] = [];
  for (const cue of cues) {
    if (!cue.enabled || sentenceIdx < cue.startSentence || sentenceIdx > cue.endSentence) continue;
    const name = humanizeCategory(cue.category);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
