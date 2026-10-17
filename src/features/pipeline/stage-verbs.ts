import type { Stage } from '@/core/domain';

/** What a stage is doing, in the present participle. Shared by the chapter list and the notification. */
export const STAGE_VERBS: Readonly<Record<Stage, string>> = {
  extract: 'Extracting',
  clean: 'Cleaning',
  segment: 'Splitting',
  analyze: 'Analyzing',
  translate: 'Translating',
  narrate: 'Narrating',
};
