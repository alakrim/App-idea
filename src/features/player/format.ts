/** Typographic minus, so a negative time reads as a sign rather than a hyphen. */
const MINUS = '−';

/** Elapsed clock: m:ss, or h:mm:ss from one hour. Negative input clamps to zero. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Time left, such as "−4:12". Zero or less reads as "−0:00". */
export function formatRemaining(ms: number): string {
  return `${MINUS}${formatClock(ms)}`;
}

/** Playback rate with the multiplication sign and at least one decimal, such as "1.25×" or "2.0×". */
export function formatRate(rate: number): string {
  return `${rate.toFixed(2).replace(/(\.\d)0$/, '$1')}×`;
}

/** A spoken-friendly duration for accessibility, such as "12 minutes 4 seconds". */
export function describeDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(plural(hours, 'hour'));
  if (minutes > 0 || hours > 0) parts.push(plural(minutes, 'minute'));
  parts.push(plural(seconds, 'second'));
  return parts.join(' ');
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
