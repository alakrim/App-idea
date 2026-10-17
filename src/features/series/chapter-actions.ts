import type { ChapterStatus } from '@/core/domain';

/** Every action a chapter offers. The long-press sheet and the accessibility actions both read these. */
export type ChapterAction = 'move-up' | 'move-down' | 're-generate' | 'stop' | 'delete';

export const CHAPTER_ACTION_LABELS: Readonly<Record<ChapterAction, string>> = {
  'move-up': 'Move up',
  'move-down': 'Move down',
  're-generate': 'Re-generate audio',
  stop: 'Stop preparing',
  delete: 'Delete chapter',
};

export interface ChapterActionFacts {
  /** 0-based position in the series, and how many chapters the series has. */
  index: number;
  count: number;
  status: ChapterStatus;
  /** Preparing right now: queued or running. */
  processing: boolean;
}

export interface ChapterAvailability {
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRegenerate: boolean;
  canStop: boolean;
}

/** Re-narration needs a finished chapter; stopping needs one that is being prepared. */
export function chapterAvailability(facts: ChapterActionFacts): ChapterAvailability {
  return {
    canMoveUp: facts.index > 0,
    canMoveDown: facts.index >= 0 && facts.index < facts.count - 1,
    canRegenerate: facts.status === 'ready',
    canStop: facts.processing,
  };
}

/** The actions for a chapter, in menu order. Deleting is always available. */
export function chapterActionsFor(availability: ChapterAvailability): ChapterAction[] {
  const actions: ChapterAction[] = [];
  if (availability.canMoveUp) actions.push('move-up');
  if (availability.canMoveDown) actions.push('move-down');
  if (availability.canRegenerate) actions.push('re-generate');
  if (availability.canStop) actions.push('stop');
  actions.push('delete');
  return actions;
}

const CHAPTER_ACTIONS: readonly ChapterAction[] = [
  'move-up',
  'move-down',
  're-generate',
  'stop',
  'delete',
];

/** Narrows an accessibility action name back to a chapter action. Unknown names are rejected. */
export function chapterActionFrom(name: string): ChapterAction | null {
  return CHAPTER_ACTIONS.find((action) => action === name) ?? null;
}
