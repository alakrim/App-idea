import { ExtractError } from './errors';

/** Bytes scanned for `<meta charset>` or `http-equiv`. The brief fixes this at 4 KB. */
const META_SCAN_BYTES = 4096;
/** WHATWG default for unlabelled non-UTF-8 content. CJK sniffing is out of scope here. */
const LEGACY_DEFAULT = 'windows-1252';

/** Decodes bytes for one charset label. Used only when the platform `TextDecoder` lacks the label. */
export type FallbackDecoder = (bytes: Uint8Array) => string;

export function normalizeCharsetLabel(label: string): string {
  return label
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

/**
 * Picks a charset in this order: BOM, the `charset` parameter of the Content-Type header,
 * `<meta charset>` or `http-equiv` in the first 4 KB, then UTF-8 validity (else windows-1252).
 */
export function detectCharset(bytes: Uint8Array, contentType?: string): string {
  const fromBom = sniffBom(bytes);
  if (fromBom) return fromBom;

  const fromHeader = contentType ? charsetFromContentType(contentType) : null;
  if (fromHeader) return fromHeader;

  const fromMeta = charsetFromMeta(bytes.subarray(0, META_SCAN_BYTES));
  if (fromMeta) return fromMeta;

  return decodeUtf8(bytes).valid ? 'utf-8' : LEGACY_DEFAULT;
}

/**
 * Decodes with the platform `TextDecoder` when it accepts the label. Otherwise uses the injected
 * fallback map, then the built-in UTF-8 decoder. Throws `UNSUPPORTED_ENCODING` if neither applies.
 */
export function decode(
  bytes: Uint8Array,
  charset: string,
  decoders: ReadonlyMap<string, FallbackDecoder> = new Map(),
): string {
  const label = normalizeCharsetLabel(charset);

  const native = nativeDecoder(label);
  if (native) return native.decode(bytes);

  const fallback = decoders.get(label) ?? (label === 'utf-8' ? decodeUtf8Fallback : undefined);
  if (fallback) return fallback(bytes);

  throw new ExtractError('UNSUPPORTED_ENCODING', `No decoder available for charset "${charset}"`);
}

function sniffBom(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  return null;
}

const CONTENT_TYPE_CHARSET = /charset\s*=\s*["']?\s*([^"';\s]+)/i;

function charsetFromContentType(contentType: string): string | null {
  const match = CONTENT_TYPE_CHARSET.exec(contentType);
  return match?.[1] ? normalizeCharsetLabel(match[1]) : null;
}

const META_CHARSET = /<meta\s[^>]*?charset\s*=\s*["']?\s*([A-Za-z0-9_\-:.]+)/i;

function charsetFromMeta(head: Uint8Array): string | null {
  // Latin-1 keeps every byte as one character, so the ASCII markup is found regardless of encoding.
  let ascii = '';
  for (const byte of head) ascii += String.fromCharCode(byte);
  const match = META_CHARSET.exec(ascii);
  return match?.[1] ? normalizeCharsetLabel(match[1]) : null;
}

function nativeDecoder(label: string): TextDecoder | null {
  if (typeof TextDecoder === 'undefined') return null;
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
}

/** Decodes UTF-8 by hand, replacing each malformed sequence with U+FFFD. `valid` is false when any was found. */
function decodeUtf8(bytes: Uint8Array): { text: string; valid: boolean } {
  let text = '';
  let valid = true;
  let i = 0;

  while (i < bytes.length) {
    const lead = bytes[i] ?? 0;
    let codePoint = lead;
    let continuation = 0;
    let minimum = 0;

    if (lead < 0x80) {
      continuation = 0;
    } else if (lead >= 0xc2 && lead <= 0xdf) {
      continuation = 1;
      codePoint = lead & 0x1f;
      minimum = 0x80;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      continuation = 2;
      codePoint = lead & 0x0f;
      minimum = 0x800;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      continuation = 3;
      codePoint = lead & 0x07;
      minimum = 0x10000;
    } else {
      text += '�';
      valid = false;
      i += 1;
      continue;
    }

    let consumed = 1;
    let complete = true;
    for (; consumed <= continuation; consumed++) {
      const next = bytes[i + consumed];
      if (next === undefined || (next & 0xc0) !== 0x80) {
        complete = false;
        break;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }

    const inRange =
      complete &&
      codePoint >= minimum &&
      codePoint <= 0x10ffff &&
      !(codePoint >= 0xd800 && codePoint <= 0xdfff);

    if (inRange) {
      text += String.fromCodePoint(codePoint);
    } else {
      text += '�';
      valid = false;
    }
    i += consumed;
  }

  return { text, valid };
}

function decodeUtf8Fallback(bytes: Uint8Array): string {
  return decodeUtf8(bytes).text;
}
