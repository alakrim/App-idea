/*
 * The foreground notification repeats the chapter row's step words (services/pipeline/
 * background-notification.ts). This test keeps the two in step: for each progress state, the
 * notification text equals the row's processing line. The row line also shows elapsed time after 30 s,
 * which the notification leaves out, so these progress states start well inside that window.
 */
import type { Chapter } from '@/core/domain';
import { statusLine } from '@/features/chapter/chapter-status';
import type { ChapterProgress, StageProgress } from '@/features/pipeline/facade';
import { describeStep } from '@/services/pipeline/background-notification';

const CHAPTER: Chapter = {
  id: '01J00000000000000000000CHP',
  seriesId: '01J00000000000000000000SRS',
  order: 1,
  title: 'The night harbour',
  source: { kind: 'url', url: 'https://example.com/harbour' },
  sourceLang: 'en',
  status: 'processing',
  wordCount: 1200,
  durationMs: null,
  createdAt: 0,
  updatedAt: 0,
};

function progressWith(stages: Partial<StageProgress>[], reconnecting = false): ChapterProgress {
  return {
    chapterId: CHAPTER.id,
    state: 'running',
    stages: stages.map((stage) => ({
      stage: 'narrate',
      status: 'pending',
      progress: 0,
      since: null,
      passages: null,
      ...stage,
    })) as StageProgress[],
    overall: 0,
    readySegments: 0,
    totalSegments: null,
    costUsdSoFar: 0,
    error: null,
    reconnecting,
  };
}

const CASES: { name: string; progress: ChapterProgress | null }[] = [
  { name: 'nothing known yet', progress: null },
  {
    name: 'queued, no stage running',
    progress: progressWith([{ stage: 'extract', status: 'done', progress: 1 }]),
  },
  {
    name: 'narrating with passages',
    progress: progressWith([
      { stage: 'narrate', status: 'running', passages: { done: 4, total: 18 } },
    ]),
  },
  {
    name: 'translating by percentage',
    progress: progressWith([{ stage: 'translate', status: 'running', progress: 0.5 }]),
  },
  {
    name: 'analyzing with no measure yet',
    progress: progressWith([{ stage: 'analyze', status: 'running', progress: 0 }]),
  },
  {
    name: 'reconnecting after the app came back',
    progress: progressWith([{ stage: 'narrate', status: 'running' }], true),
  },
];

describe('the notification step text matches the chapter row', () => {
  it.each(CASES)('$name', ({ progress }) => {
    expect(describeStep(progress)).toBe(statusLine('processing', CHAPTER, progress, null, 0));
  });
});
