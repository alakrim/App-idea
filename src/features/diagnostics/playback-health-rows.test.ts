import type { PlaybackHealthSummary } from '@/core/playback/playback-health';

import { playbackHealthRows } from './playback-health-rows';

const EMPTY: PlaybackHealthSummary = {
  observedMs: 0,
  boundaries: { count: 0, p50Ms: null, p95Ms: null, maxMs: null },
  bufferingStarts: 0,
  bufferingPerMinute: null,
  runDry: 0,
  focusLossPauses: 0,
};

function valueOf(rows: ReturnType<typeof playbackHealthRows>, label: string): string | undefined {
  return rows.find((row) => row.label === label)?.value;
}

describe('playbackHealthRows', () => {
  it('shows dashes and zero counts before anything has been recorded', () => {
    const rows = playbackHealthRows(EMPTY);
    expect(valueOf(rows, 'Observed')).toBe('Under a minute');
    expect(valueOf(rows, 'Segment boundaries')).toBe('0');
    expect(valueOf(rows, 'Boundary gap p50')).toBe('–');
    expect(valueOf(rows, 'Buffering starts')).toBe('0 (–)');
  });

  it('rounds the gaps to whole milliseconds and states the buffering rate', () => {
    const rows = playbackHealthRows({
      observedMs: 600_000,
      boundaries: { count: 12, p50Ms: 118.4, p95Ms: 240.6, maxMs: 310 },
      bufferingStarts: 3,
      bufferingPerMinute: 0.3,
      runDry: 1,
      focusLossPauses: 2,
    });
    expect(valueOf(rows, 'Observed')).toBe('10.0 min');
    expect(valueOf(rows, 'Boundary gap p50')).toBe('118 ms');
    expect(valueOf(rows, 'Boundary gap p95')).toBe('241 ms');
    expect(valueOf(rows, 'Boundary gap max')).toBe('310 ms');
    expect(valueOf(rows, 'Buffering starts')).toBe('3 (0.30 per min)');
    expect(valueOf(rows, 'Ran dry')).toBe('1');
    expect(valueOf(rows, 'Focus-loss pauses')).toBe('2');
  });
});
