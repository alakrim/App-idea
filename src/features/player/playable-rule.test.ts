import type { PipelineEvent } from '@/core/pipeline/context';

import { createPlayableAnnouncer } from './playable-rule';


const A = 'chapter-a';
const B = 'chapter-b';

const playable = (chapterId: string): PipelineEvent => ({ type: 'playable', chapterId });
const done = (chapterId: string): PipelineEvent => ({ type: 'done', chapterId });

describe('createPlayableAnnouncer', () => {
  it('announces a chapter the first time its audio is playable in the foreground', () => {
    const announcer = createPlayableAnnouncer();
    expect(announcer.handle(playable(A), true)).toBe(A);
  });

  it('announces once per run, however many times the event repeats within it', () => {
    const announcer = createPlayableAnnouncer();
    expect(announcer.handle(playable(A), true)).toBe(A);
    expect(announcer.handle(playable(A), true)).toBeNull();
  });

  it('does not announce while the app is in the background, and announces nothing later for that run', () => {
    const announcer = createPlayableAnnouncer();
    expect(announcer.handle(playable(A), false)).toBeNull();
    // The app returns to the foreground: the same run's event is not replayed by the runner.
    expect(announcer.handle(playable(A), true)).toBe(A);
  });

  it('announces again after the run ends, so a retry is announced too', () => {
    const announcer = createPlayableAnnouncer();
    expect(announcer.handle(playable(A), true)).toBe(A);
    expect(announcer.handle(done(A), true)).toBeNull();
    expect(announcer.handle(playable(A), true)).toBe(A);
  });

  it('tracks each chapter on its own', () => {
    const announcer = createPlayableAnnouncer();
    expect(announcer.handle(playable(A), true)).toBe(A);
    expect(announcer.handle(playable(B), true)).toBe(B);
    expect(announcer.handle(playable(A), true)).toBeNull();
  });

  it('ignores every event that is not the first audio', () => {
    const announcer = createPlayableAnnouncer();
    const others: PipelineEvent[] = [
      {
        type: 'segmentReady',
        chapterId: A,
        segment: {
          idx: 1,
          sentenceStart: 2,
          sentenceEnd: 3,
          durationMs: 6000,
          uri: 'file:///two.m4a',
          chars: 100,
          synthesis: null,
        },
      },
      { type: 'analysisReady', chapterId: A },
      { type: 'spokenChars', chapterId: A, chars: 900 },
    ];
    for (const event of others) expect(announcer.handle(event, true)).toBeNull();
  });
});
