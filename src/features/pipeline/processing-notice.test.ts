import { createThrottle, noticeOf, noticeText } from './processing-notice';

import type { ChapterProgress, StageProgress } from './facade';

const ID = '01J0000000000000000000CHAP';

function progressOf(
  overrides: Partial<ChapterProgress> & { running?: Partial<StageProgress> },
): ChapterProgress {
  const { running, ...rest } = overrides;
  const stages: StageProgress[] = [
    { stage: 'extract', status: 'done', progress: 1, since: null, passages: null },
    { stage: 'analyze', status: 'done', progress: 1, since: null, passages: null },
    {
      stage: 'narrate',
      status: running ? 'running' : 'pending',
      progress: 0,
      since: null,
      passages: null,
      ...running,
    },
  ];
  return {
    chapterId: ID,
    state: 'running',
    stages,
    overall: 0.4,
    readySegments: 0,
    totalSegments: null,
    costUsdSoFar: 0,
    error: null,
    retryAt: null,
    playable: false,
    etaMs: null,
    narratedMs: 0,
    estimatedTotalMs: null,
    reconnecting: false,
    ...rest,
  };
}

describe('noticeText', () => {
  it('names the running stage and its percent', () => {
    expect(noticeText(progressOf({ running: { progress: 0.4 } }))).toBe('Narrating · 40%');
  });

  it('says it is waiting for a connection, with no stage to name', () => {
    expect(noticeText(progressOf({ state: 'waiting', retryAt: 9 }))).toBe('Waiting for connection');
  });

  it('says queued when no stage has started', () => {
    expect(noticeText(progressOf({ state: 'queued' }))).toBe('Queued');
  });
});

describe('noticeOf', () => {
  it('carries the chapter, the title, the line and the overall progress', () => {
    expect(noticeOf(progressOf({ running: { progress: 0.5 } }), 'The harbour')).toEqual({
      chapterId: ID,
      title: 'The harbour',
      text: 'Narrating · 50%',
      progress: 0.4,
    });
  });
});

describe('createThrottle', () => {
  interface Timer {
    readonly at: number;
    readonly run: () => void;
    cancelled: boolean;
  }

  function harness(intervalMs: number) {
    let clock = 0;
    let timers: Timer[] = [];
    const sent: string[] = [];
    const throttle = createThrottle<string>({
      intervalMs,
      now: () => clock,
      schedule: (ms, run) => {
        const timer: Timer = { at: clock + ms, run, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
      send: (value) => sent.push(value),
    });
    const advance = (ms: number) => {
      const target = clock + ms;
      for (;;) {
        const due = timers
          .filter((t) => !t.cancelled && t.at <= target)
          .sort((a, b) => a.at - b.at);
        const next = due[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next);
        clock = next.at;
        next.run();
      }
      clock = target;
    };
    return {
      throttle,
      sent,
      advance,
      pendingTimers: () => timers.filter((t) => !t.cancelled).length,
    };
  }

  it('sends the first value at once', () => {
    const { throttle, sent } = harness(1000);
    throttle.push('a');
    expect(sent).toEqual(['a']);
  });

  it('coalesces a burst into one trailing send with the latest value', () => {
    const { throttle, sent, advance, pendingTimers } = harness(1000);
    throttle.push('a');
    advance(100);
    throttle.push('b');
    advance(100);
    throttle.push('c');
    expect(sent).toEqual(['a']);
    expect(pendingTimers()).toBe(1);

    advance(1000);
    expect(sent).toEqual(['a', 'c']);
  });

  it('sends at once again when the interval has passed', () => {
    const { throttle, sent, advance } = harness(1000);
    throttle.push('a');
    advance(1000);
    throttle.push('b');
    expect(sent).toEqual(['a', 'b']);
  });

  it('drops the waiting value when cancelled', () => {
    const { throttle, sent, advance } = harness(1000);
    throttle.push('a');
    throttle.push('b');
    throttle.cancel();
    advance(5000);
    expect(sent).toEqual(['a']);
  });
});
