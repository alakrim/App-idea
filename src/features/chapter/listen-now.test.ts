import type { ChapterProgress } from '@/features/pipeline/facade';

import { listenNowOf, PREPARING_COPY, progressCopy } from './listen-now';

const MIN = 60_000;

function progress(overrides: Partial<ChapterProgress> = {}): ChapterProgress {
  return {
    chapterId: 'c1',
    state: 'running',
    stages: [],
    overall: 0.4,
    playable: true,
    etaMs: 3 * MIN,
    readySegments: 4,
    totalSegments: null,
    narratedMs: 12 * MIN,
    estimatedTotalMs: 40 * MIN,
    costUsdSoFar: 0,
    error: null,
    reconnecting: false,
    ...overrides,
  };
}

describe('listenNowOf', () => {
  it('offers Play, enabled, once the chapter is ready', () => {
    expect(listenNowOf('ready', progress({ state: 'ready' }))).toEqual({
      label: 'Play chapter',
      subtitle: null,
      enabled: true,
    });
  });

  it('offers Listen now with the ready time and the time left, once the first segment is saved', () => {
    expect(listenNowOf('processing', progress())).toEqual({
      label: 'Listen now',
      subtitle: '12 m ready · about 3 m left',
      enabled: true,
    });
  });

  it('shows the preparing line instead of an estimate until the rate is known', () => {
    expect(listenNowOf('processing', progress({ etaMs: null }))).toEqual({
      label: 'Listen now',
      subtitle: PREPARING_COPY,
      enabled: true,
    });
  });

  it('is disabled while the first segment is not saved yet', () => {
    expect(listenNowOf('processing', progress({ playable: false, etaMs: null }))).toEqual({
      label: 'Listen now',
      subtitle: PREPARING_COPY,
      enabled: false,
    });
  });

  it('is a disabled Play for a waiting chapter that has no audio yet', () => {
    expect(
      listenNowOf('processing', progress({ state: 'waiting', playable: false })),
    ).toMatchObject({ label: 'Listen now', enabled: false });
  });

  it('keeps Play disabled for a draft, a stopped chapter and one with no progress', () => {
    for (const state of ['draft', 'failed'] as const) {
      expect(listenNowOf(state, null)).toEqual({
        label: 'Play chapter',
        subtitle: null,
        enabled: false,
      });
    }
  });
});

describe('progressCopy', () => {
  it('reads the minutes and the time left in whole minutes', () => {
    expect(progressCopy(progress({ narratedMs: 90 * MIN, etaMs: 5 * MIN }))).toBe(
      '1 h 30 m ready · about 5 m left',
    );
  });

  it('says under a minute for a short ready span or a short time left', () => {
    expect(progressCopy(progress({ narratedMs: 20_000, etaMs: 30_000 }))).toBe(
      'Under a minute ready · under a minute left',
    );
  });
});
