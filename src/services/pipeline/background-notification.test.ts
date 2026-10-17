import type { ChapterProgress, StageProgress } from '@/features/pipeline/facade';

import {
  describeStep,
  notificationOf,
  progressOf,
  QUEUED_TEXT,
  RECONNECTING_TEXT,
} from './background-notification';

function withStages(stages: Partial<StageProgress>[]): ChapterProgress {
  return {
    chapterId: 'c',
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
    reconnecting: false,
  };
}

describe('progressOf', () => {
  it('counts passages for a narration stage', () => {
    const progress = withStages([
      { stage: 'narrate', status: 'running', passages: { done: 4, total: 18 } },
    ]);
    expect(progressOf(progress)).toEqual({ value: 4, max: 18, indeterminate: false });
  });

  it('uses the stage percentage when it has no passages', () => {
    const progress = withStages([{ stage: 'translate', status: 'running', progress: 0.256 }]);
    expect(progressOf(progress)).toEqual({ value: 26, max: 100, indeterminate: false });
  });

  it('is indeterminate when nothing runs, or the running stage has no measure yet', () => {
    expect(progressOf(null).indeterminate).toBe(true);
    expect(
      progressOf(withStages([{ stage: 'extract', status: 'done', progress: 1 }])).indeterminate,
    ).toBe(true);
    expect(
      progressOf(withStages([{ stage: 'extract', status: 'running', progress: 0 }])).indeterminate,
    ).toBe(true);
  });

  it('never reports more passages than the total', () => {
    const progress = withStages([
      { stage: 'narrate', status: 'running', passages: { done: 20, total: 18 } },
    ]);
    expect(progressOf(progress).value).toBe(18);
  });
});

describe('describeStep', () => {
  it('names the running stage and its passage', () => {
    const progress = withStages([
      { stage: 'narrate', status: 'running', passages: { done: 4, total: 18 } },
    ]);
    expect(describeStep(progress)).toBe('Narrating · passage 5 of 18');
  });

  it('names a stage without passages by its percentage', () => {
    expect(
      describeStep(withStages([{ stage: 'translate', status: 'running', progress: 0.5 }])),
    ).toBe('Translating · 50%');
  });

  it('says queued when no stage runs, and reconnecting after the app came back', () => {
    expect(describeStep(null)).toBe(QUEUED_TEXT);
    expect(describeStep(withStages([{ stage: 'extract', status: 'done', progress: 1 }]))).toBe(
      QUEUED_TEXT,
    );
    const back = { ...withStages([{ stage: 'narrate', status: 'running' }]), reconnecting: true };
    expect(describeStep(back)).toBe(RECONNECTING_TEXT);
  });
});

describe('notificationOf', () => {
  it('uses the chapter title, the step text, and Lectio when the title is unknown', () => {
    const progress = withStages([{ stage: 'narrate', status: 'running', progress: 0.3 }]);

    expect(notificationOf({ title: 'Harbour', progress })).toEqual({
      title: 'Harbour',
      text: 'Narrating · 30%',
      progress: { value: 30, max: 100, indeterminate: false },
    });
    expect(notificationOf({ title: null, progress: null }).title).toBe('Lectio');
  });
});
