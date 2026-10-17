import { z } from 'zod';

/**
 * One row of assets/ambience/LICENSES.json. In-house sounds carry only id, license and author. Sampled
 * sounds (ADR-0005) add the source title, the page, and the licence URL.
 */
const ambienceEntrySchema = z.object({
  id: z.string(),
  license: z.string(),
  author: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
});

export interface LicenseEntry {
  id: string;
  title: string;
  license: string;
  /**
   * The attribution line that CC BY requires: title, author, licence and the page it came from.
   * Null when the licence needs no credit (CC0, Public Domain and in-house sounds).
   */
  credit: string | null;
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
    const { id, license, author, title, source } = parsed.data;
    entries.push({
      id,
      title: soundTitle(id),
      license,
      credit: creditLine({ license, author, title, source }),
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

const ATTRIBUTION_LICENCE = /^CC BY\b/;

function creditLine({
  license,
  author,
  title,
  source,
}: {
  license: string;
  author: string | undefined;
  title: string | undefined;
  source: string | undefined;
}): string | null {
  if (!ATTRIBUTION_LICENCE.test(license) || !author || !title || !source) return null;
  return `"${title}" by ${author}. Licence: ${license}. Source: ${source}`;
}
