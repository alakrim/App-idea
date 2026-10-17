/*
 * ID3 tags at the edges of an MP3 file. An ID3v2 tag sits in front of the frames and an ID3v1 tag
 * in the last 128 bytes. Both are metadata, so joining two MP3 files drops the tags of the second
 * one. Pure, so it runs in Node tests and on the device.
 */

const ID3V2_HEADER_BYTES = 10;
const ID3V2_FOOTER_FLAG = 0x10;
const ID3V1_BYTES = 128;

/** Byte length of the ID3v2 tag at the start of `bytes`, footer included, or 0 when there is none. */
export function id3v2Length(bytes: Uint8Array): number {
  if (!startsWith(bytes, 0, 'ID3') || bytes.length < ID3V2_HEADER_BYTES) return 0;
  const size =
    ((bytes[6] ?? 0) & 0x7f) * 2 ** 21 +
    ((bytes[7] ?? 0) & 0x7f) * 2 ** 14 +
    ((bytes[8] ?? 0) & 0x7f) * 2 ** 7 +
    ((bytes[9] ?? 0) & 0x7f);
  const footer = ((bytes[5] ?? 0) & ID3V2_FOOTER_FLAG) !== 0 ? ID3V2_HEADER_BYTES : 0;
  return Math.min(bytes.length, ID3V2_HEADER_BYTES + size + footer);
}

/** Byte length of the ID3v1 tag at the end of `bytes`, or 0 when there is none. */
export function id3v1Length(bytes: Uint8Array): number {
  const start = bytes.length - ID3V1_BYTES;
  return start >= 0 && startsWith(bytes, start, 'TAG') ? ID3V1_BYTES : 0;
}

function startsWith(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}
