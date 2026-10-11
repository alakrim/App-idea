import { mp3DurationMs, parseFrameHeader } from './mp3-duration';

interface HeaderSpec {
  version: 'mpeg1' | 'mpeg2' | 'mpeg25';
  layer: 1 | 2 | 3;
  /** The 4-bit bitrate field: 1 to 14 are valid. */
  bitrateIndex: number;
  /** The 2-bit sample rate field: 0 to 2 are valid. */
  sampleRateIndex: number;
  padding?: 0 | 1;
  mono?: boolean;
}

const VERSION_BITS = { mpeg1: 3, mpeg2: 2, mpeg25: 0 } as const;
const LAYER_BITS = { 1: 3, 2: 2, 3: 1 } as const;

/** Four header bytes. The protection bit is set, so no CRC follows. */
function headerBytes(spec: HeaderSpec): Uint8Array {
  const b2 = 0xe0 | (VERSION_BITS[spec.version] << 3) | (LAYER_BITS[spec.layer] << 1) | 1;
  const b3 = (spec.bitrateIndex << 4) | (spec.sampleRateIndex << 2) | ((spec.padding ?? 0) << 1);
  const b4 = spec.mono ? 0xc0 : 0x00;
  return Uint8Array.from([0xff, b2, b3, b4]);
}

/** One complete frame: the header, then zeroed payload, sized as the header says. */
function frame(spec: HeaderSpec, overlay: Record<number, number[]> = {}): Uint8Array {
  const header = headerBytes(spec);
  const length = parseFrameHeader(header, 0)?.frameLength ?? 0;
  const bytes = new Uint8Array(length);
  bytes.set(header, 0);
  for (const [offset, values] of Object.entries(overlay)) bytes.set(values, Number(offset));
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const uint32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const MPEG1_L3_128_44K: HeaderSpec = { version: 'mpeg1', layer: 3, bitrateIndex: 9, sampleRateIndex: 0 };

describe('parseFrameHeader', () => {
  it('reads the frame length of a 128 kbit/s MPEG-1 Layer III frame at 44.1 kHz', () => {
    const header = parseFrameHeader(headerBytes(MPEG1_L3_128_44K), 0);
    expect(header).toMatchObject({
      version: 'mpeg1',
      layer: 3,
      sampleRate: 44100,
      samplesPerFrame: 1152,
      frameLength: 417,
    });
  });

  it('adds the padding byte to the frame length', () => {
    expect(parseFrameHeader(headerBytes({ ...MPEG1_L3_128_44K, padding: 1 }), 0)?.frameLength).toBe(
      418,
    );
  });

  it('uses 576 samples for MPEG-2 Layer III', () => {
    const header = parseFrameHeader(
      headerBytes({ version: 'mpeg2', layer: 3, bitrateIndex: 8, sampleRateIndex: 0 }),
      0,
    );
    expect(header).toMatchObject({ samplesPerFrame: 576, sampleRate: 22050 });
  });

  it('rejects reserved and invalid fields', () => {
    const bad: Uint8Array[] = [
      Uint8Array.from([0x00, 0xfb, 0x90, 0x00]), // no sync word
      Uint8Array.from([0xff, 0xe8, 0x90, 0x00]), // reserved MPEG version (01)
      Uint8Array.from([0xff, 0xf8, 0x90, 0x00]), // reserved layer (00)
      Uint8Array.from([0xff, 0xfb, 0x00, 0x00]), // free-format bitrate (0)
      Uint8Array.from([0xff, 0xfb, 0xf0, 0x00]), // bad bitrate (15)
      Uint8Array.from([0xff, 0xfb, 0x9c, 0x00]), // reserved sample rate (3)
    ];
    for (const bytes of bad) expect(parseFrameHeader(bytes, 0)).toBeNull();
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfb]), 0)).toBeNull();
  });
});

describe('mp3DurationMs', () => {
  it('computes the duration of a CBR file by walking its frames', () => {
    const frames = Array.from({ length: 100 }, () => frame(MPEG1_L3_128_44K));
    // 100 frames of 1,152 samples at 44.1 kHz.
    expect(mp3DurationMs(concat(frames))).toBe(2612);
  });

  it('counts padded frames at the same duration', () => {
    const frames = Array.from({ length: 100 }, (_, i) =>
      frame({ ...MPEG1_L3_128_44K, padding: i % 2 === 0 ? 1 : 0 }),
    );
    expect(mp3DurationMs(concat(frames))).toBe(2612);
  });

  it('handles MPEG-2 Layer III at 22.05 kHz with 576 samples per frame', () => {
    const spec: HeaderSpec = { version: 'mpeg2', layer: 3, bitrateIndex: 8, sampleRateIndex: 0 };
    const frames = Array.from({ length: 50 }, () => frame(spec));
    expect(mp3DurationMs(concat(frames))).toBe(Math.round((50 * 576 * 1000) / 22050));
  });

  it('uses the Xing frame count for a VBR file, even when the frames are cut short', () => {
    const stereoXing = 4 + 32; // Frame header, then side information for stereo MPEG-1.
    const xing = frame(MPEG1_L3_128_44K, { [stereoXing]: [...ascii('Xing'), ...uint32(1), ...uint32(1000)] });
    const file = concat([xing, frame(MPEG1_L3_128_44K), frame(MPEG1_L3_128_44K)]);
    // The header says 1,000 frames, so the duration is 1,000 frames, not the three present.
    expect(mp3DurationMs(file)).toBe(Math.round((1000 * 1152 * 1000) / 44100));
  });

  it('reads an Info tag in a mono file, where the side information is shorter', () => {
    const monoSpec = { ...MPEG1_L3_128_44K, mono: true };
    const info = frame(monoSpec, { [4 + 17]: [...ascii('Info'), ...uint32(1), ...uint32(250)] });
    expect(mp3DurationMs(info)).toBe(Math.round((250 * 1152 * 1000) / 44100));
  });

  it('reads a VBRI frame count', () => {
    const vbri = frame(MPEG1_L3_128_44K, { 36: [...ascii('VBRI'), 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, ...uint32(500)] });
    expect(mp3DurationMs(concat([vbri, frame(MPEG1_L3_128_44K)]))).toBe(
      Math.round((500 * 1152 * 1000) / 44100),
    );
  });

  it('measures VBR frames of mixed bitrates by walking them', () => {
    const low = Array.from({ length: 10 }, () => frame(MPEG1_L3_128_44K));
    const high = Array.from({ length: 10 }, () =>
      frame({ version: 'mpeg1', layer: 3, bitrateIndex: 14, sampleRateIndex: 0 }),
    );
    expect(mp3DurationMs(concat([...low, ...high]))).toBe(Math.round((20 * 1152 * 1000) / 44100));
  });

  it('skips a leading ID3v2 tag', () => {
    const id3 = Uint8Array.from([...ascii('ID3'), 4, 0, 0, 0, 0, 0, 5, ...new Array(5).fill(0)]);
    const frames = Array.from({ length: 100 }, () => frame(MPEG1_L3_128_44K));
    expect(mp3DurationMs(concat([id3, ...frames]))).toBe(2612);
  });

  it('ignores trailing bytes that are not a frame', () => {
    const frames = Array.from({ length: 100 }, () => frame(MPEG1_L3_128_44K));
    expect(mp3DurationMs(concat([...frames, new Uint8Array(20).fill(0x55)]))).toBe(2612);
  });

  it('returns null when there is no MPEG frame', () => {
    expect(mp3DurationMs(new Uint8Array(0))).toBeNull();
    expect(mp3DurationMs(new TextEncoder().encode('RIFF....WAVEfmt '))).toBeNull();
  });
});
