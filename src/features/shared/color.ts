/** Hex colour (#RRGGBB) with an alpha channel, as an rgba() string for gradients and washes. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match?.[1]) throw new Error(`Expected a #RRGGBB colour, got ${hex}`);
  const value = parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${Math.min(1, Math.max(0, alpha))})`;
}

/** Linear mix of two #RRGGBB colours. `t` = 0 gives `from`, 1 gives `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const a = channels(from);
  const b = channels(to);
  const clamped = Math.min(1, Math.max(0, t));
  const mixed = a.map((channel, i) => Math.round(channel + ((b[i] ?? 0) - channel) * clamped));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function channels(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match?.[1]) throw new Error(`Expected a #RRGGBB colour, got ${hex}`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
