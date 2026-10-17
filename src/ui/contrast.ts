/** WCAG 2.x contrast helpers for solid hex colours. Pure, so tests can run them in Node. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

export function parseHex(hex: string): Rgb {
  const match = HEX_PATTERN.exec(hex);
  if (!match?.[1]) {
    throw new Error(`Expected a solid #RRGGBB colour, received "${hex}".`);
  }
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** Returns the contrast ratio between two solid colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const RGBA_PATTERN = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d*\.?\d+)\)$/;

function toHex(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, '0');
}

/**
 * Flattens a translucent `rgba(r,g,b,a)` colour over an opaque backdrop and returns the solid
 * `#RRGGBB` that is actually seen. A solid hex colour is checked and returned unchanged.
 */
export function flattenOver(color: string, backdrop: string): string {
  const match = RGBA_PATTERN.exec(color);
  if (!match) {
    parseHex(color);
    return color;
  }
  const [, red = '0', green = '0', blue = '0', alphaText = '1'] = match;
  const alpha = Number(alphaText);
  const under = parseHex(backdrop);
  const blended = [
    Number(red) * alpha + under.r * (1 - alpha),
    Number(green) * alpha + under.g * (1 - alpha),
    Number(blue) * alpha + under.b * (1 - alpha),
  ];
  return `#${blended.map(toHex).join('').toUpperCase()}`;
}
