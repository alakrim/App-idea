import type { PipelineEvent } from '@/core/pipeline/context';

import { activityOf } from './activity';

const ID = '01J0000000000000000000CHAP';

describe('activityOf', () => {
  it('starts a stage when it starts running, and touches it for any other stage status', () => {
    expect(
      activityOf({ type: 'stage', chapterId: ID, stage: 'narrate', status: 'running' }),
    ).toEqual({ kind: 'start', chapterId: ID, stage: 'narrate' });
    expect(activityOf({ type: 'stage', chapterId: ID, stage: 'narrate', status: 'done' })).toEqual({
      kind: 'touch',
      chapterId: ID,
      stage: 'narrate',
    });
  });

  it('touches a stage on progress and on cost', () => {
    expect(
      activityOf({ type: 'progress', chapterId: ID, stage: 'analyze', progress: 0.3 }),
    ).toEqual({ kind: 'touch', chapterId: ID, stage: 'analyze' });
    expect(
      activityOf({ type: 'cost', chapterId: ID, stage: 'analyze', usd: 0.01, totalUsd: 0.01 }),
    ).toEqual({ kind: 'touch', chapterId: ID, stage: 'analyze' });
  });

  it('counts a stall and a stale abort against their stage', () => {
    expect(activityOf({ type: 'stall', chapterId: ID, stage: 'narrate', count: 2 })).toEqual({
      kind: 'stall',
      chapterId: ID,
      stage: 'narrate',
    });
    expect(activityOf({ type: 'staleAbort', chapterId: ID, stage: 'narrate' })).toEqual({
      kind: 'staleAbort',
      chapterId: ID,
      stage: 'narrate',
    });
  });

  it('ignores events that say nothing about a stage', () => {
    const silent: PipelineEvent[] = [
      { type: 'done', chapterId: ID },
      { type: 'reconnecting', chapterId: ID },
    ];
    for (const event of silent) expect(activityOf(event)).toBeNull();
  });
});
