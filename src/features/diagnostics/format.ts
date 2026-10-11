import type { JsonValue, ProbeResult } from './probe';

/** One value of a probe, as a label and a short text for the screen. */
export interface ValueLine {
  key: string;
  text: string;
}

/** Flattens a probe's values into lines a reader can scan: scalars as is, objects as JSON. */
export function valueLines(values: Record<string, JsonValue>): ValueLine[] {
  return Object.entries(values).map(([key, value]) => ({ key, text: valueText(value) }));
}

export function valueText(value: JsonValue): string {
  if (value === null) return 'none';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** The line a result shows under its label: its message when it has one, else a count of values. */
export function resultHeadline(result: ProbeResult): string {
  if (result.message) return result.message;
  const count = Object.keys(result.values).length;
  return count === 0 ? '' : `${count} value${count === 1 ? '' : 's'} recorded`;
}
