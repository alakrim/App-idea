import { id3v1Length, id3v2Length } from './id3';

/** An ID3v2.4 tag header with a syncsafe size, then `payload` zero bytes. */
function id3v2(payload: number, options: { footer?: boolean } = {}): Uint8Array {
  const size = payload;
  const footer = options.footer === true ? 10 : 0;
  const out = new Uint8Array(10 + payload + footer);
  out.set([0x49, 0x44, 0x33, 4, 0, options.footer === true ? 0x10 : 0], 0);
  out.set(
    [(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f],
    6,
  );
  return out;
}

describe('id3v2Length', () => {
  it('reads the size of a leading ID3v2 tag, header included', () => {
    expect(id3v2Length(id3v2(300))).toBe(310);
  });

  it('adds the footer when the footer flag is set', () => {
    expect(id3v2Length(id3v2(300, { footer: true }))).toBe(320);
  });

  it('reads a size that uses the high syncsafe bytes', () => {
    expect(id3v2Length(id3v2(200_000))).toBe(200_010);
  });

  it('returns 0 when there is no tag at the start', () => {
    expect(id3v2Length(new Uint8Array([0xff, 0xfb, 0x90, 0]))).toBe(0);
    expect(id3v2Length(new Uint8Array([0x49, 0x44]))).toBe(0);
  });

  it('never reports more than the bytes present', () => {
    const truncated = id3v2(300).subarray(0, 100);
    expect(id3v2Length(truncated)).toBe(100);
  });
});

describe('id3v1Length', () => {
  it('finds a 128-byte ID3v1 tag at the end', () => {
    const bytes = new Uint8Array(400);
    bytes.set([0x54, 0x41, 0x47], 400 - 128);
    expect(id3v1Length(bytes)).toBe(128);
  });

  it('returns 0 when the last 128 bytes are not a tag, or the file is shorter than one', () => {
    expect(id3v1Length(new Uint8Array(400))).toBe(0);
    expect(id3v1Length(new Uint8Array([0x54, 0x41, 0x47]))).toBe(0);
  });
});
