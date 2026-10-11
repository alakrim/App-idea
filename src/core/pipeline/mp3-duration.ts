/*
 * Duration of an MP3 file from its MPEG audio frame headers. Pure and dependency-free, so it runs
 * in Node tests and on the device.
 *
 * A Xing or Info header (VBR) or a VBRI header states the frame count, which is read directly. With
 * no such header the frames are walked one by one, which is exact for CBR and VBR alike.
 */

/** Bitrates in kbit/s, indexed by the 4-bit bitrate field minus one. */
const BITRATES = {
  mpeg1: {
    1: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  mpeg2: {
    1: [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
} as const;

const SAMPLE_RATES = {
  mpeg1: [44100, 48000, 32000],
  mpeg2: [22050, 24000, 16000],
  mpeg25: [11025, 12000, 8000],
} as const;

type MpegVersion = 'mpeg1' | 'mpeg2' | 'mpeg25';
/** 1 is Layer I, 2 is Layer II, 3 is Layer III. */
type Layer = 1 | 2 | 3;

export interface FrameHeader {
  readonly version: MpegVersion;
  readonly layer: Layer;
  readonly sampleRate: number;
  readonly samplesPerFrame: number;
  readonly frameLength: number;
  /** Protection bit clear: a 2-byte CRC follows the header. */
  readonly crcPresent: boolean;
  readonly mono: boolean;
}

const HEADER_BYTES = 4;
const VBRI_OFFSET = HEADER_BYTES + 32;

/** Parses the 4-byte header at `offset`. Returns null when the bytes are not a valid frame header. */
export function parseFrameHeader(bytes: Uint8Array, offset: number): FrameHeader | null {
  if (offset < 0 || offset + HEADER_BYTES > bytes.length) return null;
  const b1 = byteAt(bytes, offset);
  const b2 = byteAt(bytes, offset + 1);
  const b3 = byteAt(bytes, offset + 2);
  const b4 = byteAt(bytes, offset + 3);
  if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;

  const version = versionOf((b2 >> 3) & 0x3);
  const layer = layerOf((b2 >> 1) & 0x3);
  const bitrateIndex = (b3 >> 4) & 0xf;
  const sampleRateIndex = (b3 >> 2) & 0x3;
  if (!version || !layer || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const bitrateTable = version === 'mpeg1' ? BITRATES.mpeg1 : BITRATES.mpeg2;
  const bitrateKbps = bitrateTable[layer][bitrateIndex - 1];
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  const padding = (b3 >> 1) & 0x1;
  if (bitrateKbps === undefined || sampleRate === undefined) return null;

  const samplesPerFrame = samplesFor(version, layer);
  const bitrate = bitrateKbps * 1000;
  const frameLength =
    layer === 1
      ? (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
      : Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;

  return {
    version,
    layer,
    sampleRate,
    samplesPerFrame,
    frameLength,
    crcPresent: (b2 & 0x1) === 0,
    mono: ((b4 >> 6) & 0x3) === 0x3,
  };
}

/**
 * Duration in milliseconds, or null when the bytes contain no MPEG audio frame. A leading ID3v2
 * tag is skipped, and a Xing/Info or VBRI frame count is used when present.
 */
export function mp3DurationMs(bytes: Uint8Array): number | null {
  const start = skipId3v2(bytes);
  const first = findFirstFrame(bytes, start);
  if (!first) return null;

  const frames = readXingFrameCount(bytes, first) ?? readVbriFrameCount(bytes, first);
  if (frames !== null) return toMs(frames * first.header.samplesPerFrame, first.header);

  let samples = 0;
  let offset = first.offset;
  for (;;) {
    const header = parseFrameHeader(bytes, offset);
    if (!header || offset + header.frameLength > bytes.length) break;
    samples += header.samplesPerFrame;
    offset += header.frameLength;
  }
  return toMs(samples, first.header);
}

interface LocatedFrame {
  readonly offset: number;
  readonly header: FrameHeader;
}

function findFirstFrame(bytes: Uint8Array, start: number): LocatedFrame | null {
  for (let offset = start; offset + HEADER_BYTES <= bytes.length; offset += 1) {
    const header = parseFrameHeader(bytes, offset);
    if (header) return { offset, header };
  }
  return null;
}

function readXingFrameCount(bytes: Uint8Array, frame: LocatedFrame): number | null {
  const sideInfo = frame.header.version === 'mpeg1' ? (frame.header.mono ? 17 : 32) : frame.header.mono ? 9 : 17;
  const tagOffset = frame.offset + HEADER_BYTES + (frame.header.crcPresent ? 2 : 0) + sideInfo;
  const tag = readAscii(bytes, tagOffset, 4);
  if (tag !== 'Xing' && tag !== 'Info') return null;
  const flags = readUint32(bytes, tagOffset + 4);
  if (flags === null || (flags & 0x1) === 0) return null;
  return readUint32(bytes, tagOffset + 8);
}

function readVbriFrameCount(bytes: Uint8Array, frame: LocatedFrame): number | null {
  const tagOffset = frame.offset + VBRI_OFFSET;
  if (readAscii(bytes, tagOffset, 4) !== 'VBRI') return null;
  // After the tag: version (2), delay (2), quality (2), total bytes (4), then the frame count.
  return readUint32(bytes, tagOffset + 14);
}

function skipId3v2(bytes: Uint8Array): number {
  if (readAscii(bytes, 0, 3) !== 'ID3') return 0;
  const size =
    ((byteAt(bytes, 6) & 0x7f) << 21) |
    ((byteAt(bytes, 7) & 0x7f) << 14) |
    ((byteAt(bytes, 8) & 0x7f) << 7) |
    (byteAt(bytes, 9) & 0x7f);
  const footer = (byteAt(bytes, 5) & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

function toMs(samples: number, header: FrameHeader): number {
  return Math.round((samples / header.sampleRate) * 1000);
}

function samplesFor(version: MpegVersion, layer: Layer): number {
  if (layer === 1) return 384;
  if (layer === 2) return 1152;
  return version === 'mpeg1' ? 1152 : 576;
}

function versionOf(bits: number): MpegVersion | null {
  if (bits === 3) return 'mpeg1';
  if (bits === 2) return 'mpeg2';
  if (bits === 0) return 'mpeg25';
  return null;
}

function layerOf(bits: number): Layer | null {
  if (bits === 3) return 1;
  if (bits === 2) return 2;
  if (bits === 1) return 3;
  return null;
}

function byteAt(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string | null {
  if (offset < 0 || offset + length > bytes.length) return null;
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (
    ((byteAt(bytes, offset) << 24) >>> 0) +
    (byteAt(bytes, offset + 1) << 16) +
    (byteAt(bytes, offset + 2) << 8) +
    byteAt(bytes, offset + 3)
  );
}
