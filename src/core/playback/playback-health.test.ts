import { createPlaybackHealthLog, HEALTH_WINDOW_MS } from './playback-health';

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('playback health log', () => {
  it('reports a gap from the boundary start to the incoming segment playing', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now });
    log.boundaryStarted(0);
    time.advance(120);
    log.boundaryPlaying();

    expect(log.summary().boundaries).toEqual({ count: 1, p50Ms: 120, p95Ms: 120, maxMs: 120 });
  });

  it('keeps the earliest start when a boundary is armed twice before it plays', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now });
    log.boundaryStarted(0);
    time.advance(80);
    log.boundaryStarted(0);
    time.advance(40);
    log.boundaryPlaying();

    expect(log.summary().boundaries.maxMs).toBe(120);
  });

  it('measures a pre-roll from the predicted end of the outgoing segment, so early play is an overlap', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now });
    // The outgoing segment has 80 ms left; the incoming one starts now and plays 30 ms later.
    log.boundaryStarted(80);
    time.advance(30);
    log.boundaryPlaying();

    expect(log.summary().boundaries.maxMs).toBe(-50);
  });

  it('ignores a playing report when no boundary is open', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now });
    log.boundaryPlaying();
    expect(log.summary().boundaries.count).toBe(0);
  });

  it('computes nearest-rank p50, p95 and max over the gaps', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now });
    for (let ms = 10; ms <= 200; ms += 10) {
      log.boundaryStarted(0);
      time.advance(ms);
      log.boundaryPlaying();
      time.advance(1000);
    }
    const { boundaries } = log.summary();
    expect(boundaries.count).toBe(20);
    expect(boundaries.p50Ms).toBe(100);
    expect(boundaries.p95Ms).toBe(190);
    expect(boundaries.maxMs).toBe(200);
  });

  it('reports null percentiles with no gaps', () => {
    const log = createPlaybackHealthLog({ now: clock().now });
    expect(log.summary().boundaries).toEqual({ count: 0, p50Ms: null, p95Ms: null, maxMs: null });
  });

  it('counts buffering starts, run-dry and focus-loss pauses, and rates buffering per minute', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now });
    time.advance(120_000);
    log.bufferingStarted();
    log.bufferingStarted();
    log.ranDry();
    log.focusLossPaused();

    const summary = log.summary();
    expect(summary.observedMs).toBe(120_000);
    expect(summary.bufferingStarts).toBe(2);
    expect(summary.bufferingPerMinute).toBe(1);
    expect(summary.runDry).toBe(1);
    expect(summary.focusLossPauses).toBe(1);
  });

  it('has no buffering rate before any time has been observed', () => {
    const log = createPlaybackHealthLog({ now: clock().now });
    expect(log.summary().bufferingPerMinute).toBeNull();
  });

  it('forgets samples older than the window', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now, windowMs: 60_000 });
    log.bufferingStarted();
    log.ranDry();
    time.advance(60_001);
    log.bufferingStarted();

    const summary = log.summary();
    expect(summary.bufferingStarts).toBe(1);
    expect(summary.runDry).toBe(0);
    expect(summary.observedMs).toBe(60_000);
  });

  it('caps the observed span at the default one-hour window', () => {
    const time = clock();
    const log = createPlaybackHealthLog({ now: time.now });
    time.advance(HEALTH_WINDOW_MS * 3);
    expect(log.summary().observedMs).toBe(HEALTH_WINDOW_MS);
  });
});
