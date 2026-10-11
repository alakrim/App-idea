import { z } from 'zod';

const ambienceEntrySchema = z.object({
  id: z.string(),
  license: z.string(),
  author: z.string().optional(),
});

export interface LicenseEntry {
  id: string;
  title: string;
  license: string;
}

/**
 * Reads assets/ambience/LICENSES.json at the boundary. A malformed entry is skipped rather than
 * hiding the rest, and the screen still renders with whatever is valid.
 */
export function parseAmbienceLicenses(raw: unknown): LicenseEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: LicenseEntry[] = [];
  for (const item of raw) {
    const parsed = ambienceEntrySchema.safeParse(item);
    if (!parsed.success) continue;
    entries.push({
      id: parsed.data.id,
      title: soundTitle(parsed.data.id),
      license: parsed.data.license,
    });
  }
  return entries;
}

/** "base_rain" becomes "Rain". The id prefix is internal, so it is dropped for display. */
export function soundTitle(id: string): string {
  return id
    .replace(/^base_/, '')
    .split('_')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
