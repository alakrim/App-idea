import type { PlaybackHealthSummary } from '@/core/playback/playback-health';

export interface HealthRow {
  label: string;
  value: string;
}

function milliseconds(ms: number | null): string {
  return ms === null ? '–' : `${Math.round(ms)} ms`;
}

function observedText(observedMs: number): string {
  const minutes = observedMs / 60_000;
  return minutes < 1 ? 'Under a minute' : `${minutes.toFixed(1)} min`;
}

/** The rows of the "Playback health" card, in the order a reader scans them. */
export function playbackHealthRows(summary: PlaybackHealthSummary): HealthRow[] {
  const { boundaries } = summary;
  const bufferingRate =
    summary.bufferingPerMinute === null ? '–' : `${summary.bufferingPerMinute.toFixed(2)} per min`;
  return [
    { label: 'Observed', value: observedText(summary.observedMs) },
    { label: 'Segment boundaries', value: String(boundaries.count) },
    { label: 'Boundary gap p50', value: milliseconds(boundaries.p50Ms) },
    { label: 'Boundary gap p95', value: milliseconds(boundaries.p95Ms) },
    { label: 'Boundary gap max', value: milliseconds(boundaries.maxMs) },
    {
      label: 'Buffering starts',
      value: `${summary.bufferingStarts} (${bufferingRate})`,
    },
    { label: 'Ran dry', value: String(summary.runDry) },
    { label: 'Focus-loss pauses', value: String(summary.focusLossPauses) },
  ];
}
