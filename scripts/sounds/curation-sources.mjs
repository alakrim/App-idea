// Candidate search for the open sources (brief SND1): archive.org advancedsearch and Wikimedia Commons.
// Every response is untrusted: it is validated with zod here and anything malformed is dropped.
// Licence fields are kept as the page states them; classifyLicence (licence.mjs) decides what is allowed.

import { z } from 'zod';

import { getJson } from './http.mjs';

const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php';
const ARCHIVE_META = 'https://archive.org/metadata';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Original audio formats first, then the lossy ones, in the order archive.org names them. */
const FORMAT_PREFERENCE = ['WAVE', 'Flac', 'Ogg Vorbis', 'VBR MP3', 'MP3'];
const ARCHIVE_ROWS = 40;
/**
 * archive.org licence filters, one search each. Exact quoted URLs for CC BY (the wildcard form fails on
 * slashes) and a wildcard for the CC0 and Public Domain Mark URLs. Licences outside these are never asked for.
 */
export const ARCHIVE_LICENCE_FILTERS = [
  'licenseurl:*publicdomain*',
  'licenseurl:"https://creativecommons.org/licenses/by/4.0/"',
  'licenseurl:"http://creativecommons.org/licenses/by/4.0/"',
  'licenseurl:"https://creativecommons.org/licenses/by/3.0/"',
  'licenseurl:"http://creativecommons.org/licenses/by/3.0/"',
];

const archiveDoc = z.object({
  identifier: z.string(),
  title: z.string().optional(),
  creator: z.union([z.string(), z.array(z.string())]).optional(),
  licenseurl: z.string().optional(),
  length: z.union([z.string(), z.number()]).optional(),
  description: z.union([z.string(), z.array(z.string())]).optional(),
});
const archiveSearch = z.object({ response: z.object({ docs: z.array(archiveDoc) }) });
const archiveItemFile = z.object({
  name: z.string(),
  format: z.string().optional(),
  size: z.union([z.string(), z.number()]).optional(),
  length: z.union([z.string(), z.number()]).optional(),
});
const archiveMeta = z.object({
  metadata: z.object({ length: z.union([z.string(), z.number()]).optional() }).optional(),
  files: z.array(archiveItemFile).default([]),
});

const commonsPage = z.object({
  title: z.string(),
  descriptionurl: z.string().optional(),
  imageinfo: z
    .array(
      z.object({
        url: z.string(),
        duration: z.number().optional(),
        mime: z.string().optional(),
        extmetadata: z
          .object({
            LicenseShortName: z.object({ value: z.string() }).optional(),
            LicenseUrl: z.object({ value: z.string() }).optional(),
            Artist: z.object({ value: z.string() }).optional(),
            ImageDescription: z.object({ value: z.string() }).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
const commonsResponse = z.object({
  query: z.object({ pages: z.record(z.string(), commonsPage) }).optional(),
});

const AUDIO_MIME = /^audio\//;

/** archive.org gives length in seconds, sometimes as "HH:MM:SS" or "MM:SS". Null when unreadable. */
export function parseLengthSeconds(length) {
  if (typeof length === 'number') return Number.isFinite(length) ? length : null;
  if (typeof length !== 'string') return null;
  if (/^\d+(\.\d+)?$/.test(length)) return Number(length);
  const parts = length.split(':').map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

const firstText = (value) => (Array.isArray(value) ? value.join(' ') : (value ?? ''));

/** Stripped text of a small HTML fragment (Commons Artist fields are HTML links). */
export function plainText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/**
 * Lists archive.org audio items for a query under one licence filter. Only items with a licence URL are
 * returned. Duration is not in search results, so inspectArchiveItem reads it from the item.
 */
export async function searchArchive(query, licenceFilter) {
  const params = new URLSearchParams({
    q: `${query} AND mediatype:audio AND ${licenceFilter}`,
    rows: String(ARCHIVE_ROWS),
    output: 'json',
  });
  for (const field of ['identifier', 'title', 'creator', 'licenseurl', 'description']) {
    params.append('fl[]', field);
  }
  const parsed = archiveSearch.parse(await getJson(`${ARCHIVE_SEARCH}?${params}`));
  return parsed.response.docs
    .filter((doc) => doc.licenseurl)
    .map((doc) => ({
      source: 'archive.org',
      identifier: doc.identifier,
      title: doc.title ?? doc.identifier,
      author: firstText(doc.creator) || 'unknown',
      pageUrl: `https://archive.org/details/${doc.identifier}`,
      description: firstText(doc.description).slice(0, 600),
      licenseName: null,
      licenseUrl: doc.licenseurl,
    }));
}

/**
 * Reads one archive.org item: the preferred original audio file and that file's duration. Returns null when the item has no preferred audio file or no readable duration.
 */
export async function inspectArchiveItem(identifier) {
  const meta = archiveMeta.parse(await getJson(`${ARCHIVE_META}/${identifier}`));
  for (const format of FORMAT_PREFERENCE) {
    const file = meta.files.find((f) => f.format === format);
    if (!file) continue;
    const durationS = parseLengthSeconds(file.length ?? meta.metadata?.length);
    if (durationS === null) return null;
    return {
      downloadUrl: `https://archive.org/download/${identifier}/${encodeURIComponent(file.name)}`,
      format,
      durationS,
    };
  }
  return null;
}

/** Lists Commons audio files for a query, with their licence and duration as the file page states them. */
export async function searchCommons(query) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:audio`,
    gsrnamespace: '6',
    gsrlimit: '25',
    prop: 'imageinfo',
    iiprop: 'url|mime|duration|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription',
    format: 'json',
  });
  const parsed = commonsResponse.parse(await getJson(`${COMMONS_API}?${params}`));
  const pages = Object.values(parsed.query?.pages ?? {});
  const out = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !AUDIO_MIME.test(info.mime ?? '') || info.duration === undefined) continue;
    const meta = info.extmetadata ?? {};
    out.push({
      source: 'commons',
      title: page.title.replace(/^File:/, ''),
      author: plainText(meta.Artist?.value ?? '') || 'unknown',
      pageUrl: page.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      downloadUrl: info.url,
      durationS: info.duration,
      description: plainText(meta.ImageDescription?.value ?? '').slice(0, 600),
      licenseName: meta.LicenseShortName?.value ?? null,
      licenseUrl: meta.LicenseUrl?.value ?? null,
    });
  }
  return out;
}
