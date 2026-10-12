/*
 * Speech formats. Gemini TTS models accept only raw PCM: `response_format: "mp3"` is refused with
 * HTTP 400, and `pcm` returns 16-bit little-endian mono samples with a content type such as
 * `audio/pcm;rate=24000;channels=1`. The app stores that audio as WAV, which every player reads.
 * Some models answer in WAV, and their files are stored as they are. The container is decided by
 * the reply's content type, because a model can answer in a format other than the one asked for.
 * Joins of two clips of the same format (one long passage split in two) are here too. Pure, so it
 * runs in Node tests and on the device.
 */
import { id3v1Length, id3v2Length } from './id3';

export type SpeechFormat = 'mp3' | 'pcm' | 'wav';
type AudioContainer = SpeechFormat;

export interface StorableAudio {
  readonly bytes: Uint8Array;
  /** The MIME type to store the file under. */
  readonly mime: 'audio/mpeg' | 'audio/wav';
}

export interface PcmFormat {
  readonly rate: number;
  readonly channels: number;
}

/** Gemini's documented output: 24 kHz, mono. Used when a reply omits the parameters. */
export const DEFAULT_PCM_FORMAT: PcmFormat = { rate: 24_000, channels: 1 };

const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;
const MAX_RATE = 192_000;
const MAX_CHANNELS = 8;
const PCM_FORMAT_TAG = 1;

/** The format a model is asked for. Gemini TTS is PCM-only, and every other speech model takes MP3. */
export function speechFormatFor(modelId: string): SpeechFormat {
  return /gemini.*tts/i.test(modelId) ? 'pcm' : 'mp3';
}

/**
 * The container a speech reply is really in. The content type wins, because a model can answer in
 * another format than the one asked for. The requested format is the fallback for an unknown type.
 */
export function containerOf(
  contentType: string | null | undefined,
  requested: SpeechFormat,
): AudioContainer {
  const type = (contentType ?? '').toLowerCase();
  if (type.includes('pcm')) return 'pcm';
  if (type.includes('wav')) return 'wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  return requested;
}

/**
 * Audio ready to store. Raw PCM is wrapped in a WAV header, WAV is stored as it is, and MP3 is
 * stored as it is.
 */
export function storableAudio(
  audio: Uint8Array,
  contentType: string | null | undefined,
  requested: SpeechFormat,
): StorableAudio {
  switch (containerOf(contentType, requested)) {
    case 'pcm':
      return { bytes: pcmToWav(audio, parsePcmContentType(contentType)), mime: 'audio/wav' };
    case 'wav':
      return { bytes: audio, mime: 'audio/wav' };
    case 'mp3':
      return { bytes: audio, mime: 'audio/mpeg' };
  }
}

/**
 * Reads `rate` and `channels` from a PCM content type. A missing or invalid parameter takes its
 * default, so a malformed header degrades to Gemini's documented format rather than failing.
 */
export function parsePcmContentType(contentType: string | null | undefined): PcmFormat {
  const params = new Map<string, string>();
  for (const part of (contentType ?? '').split(';').slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  const rate = positiveInteger(params.get('rate'), MAX_RATE) ?? DEFAULT_PCM_FORMAT.rate;
  const channels =
    positiveInteger(params.get('channels'), MAX_CHANNELS) ?? DEFAULT_PCM_FORMAT.channels;
  return { rate, channels };
}

function positiveInteger(raw: string | undefined, max: number): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 && value <= max ? value : null;
}

/**
 * Wraps 16-bit PCM in a 44-byte RIFF/WAVE header. A trailing partial frame is dropped, so the data
 * length always matches whole frames.
 */
export function pcmToWav(pcm: Uint8Array, format: PcmFormat): Uint8Array {
  if (!Number.isInteger(format.rate) || format.rate <= 0) {
    throw new RangeError(`Invalid PCM sample rate: ${format.rate}`);
  }
  if (!Number.isInteger(format.channels) || format.channels <= 0) {
    throw new RangeError(`Invalid PCM channel count: ${format.channels}`);
  }
  const frameBytes = format.channels * BYTES_PER_SAMPLE;
  const dataLength = pcm.length - (pcm.length % frameBytes);
  return wavFile(
    {
      rate: format.rate,
      channels: format.channels,
      bitsPerSample: 8 * BYTES_PER_SAMPLE,
      blockAlign: frameBytes,
    },
    pcm.subarray(0, dataLength),
  );
}

interface WavLayout {
  readonly rate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  readonly blockAlign: number;
}

/** A complete WAV file: a 44-byte header for `layout`, then `data`. */
function wavFile(layout: WavLayout, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(WAV_HEADER_BYTES + data.length);
  const view = new DataView(out.buffer);
  writeAscii(out, 0, 'RIFF');
  view.setUint32(4, 36 + data.length, true);
  writeAscii(out, 8, 'WAVE');
  writeAscii(out, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT_TAG, true);
  view.setUint16(22, layout.channels, true);
  view.setUint32(24, layout.rate, true);
  view.setUint32(28, layout.rate * layout.blockAlign, true);
  view.setUint16(32, layout.blockAlign, true);
  view.setUint16(34, layout.bitsPerSample, true);
  writeAscii(out, 36, 'data');
  view.setUint32(40, data.length, true);
  out.set(data, WAV_HEADER_BYTES);
  return out;
}

/**
 * Joins two WAV files of the same PCM layout into one, with one header and the sample data of both
 * in order, so the duration is the sum. Returns null when either input is not a readable PCM WAV
 * file, or when their rate, channel count or sample size differ.
 */
export function joinWav(first: Uint8Array, second: Uint8Array): Uint8Array | null {
  const a = parseWav(first);
  const b = parseWav(second);
  if (!a || !b) return null;
  const sameLayout =
    a.layout.rate === b.layout.rate &&
    a.layout.channels === b.layout.channels &&
    a.layout.bitsPerSample === b.layout.bitsPerSample;
  if (!sameLayout) return null;
  const data = new Uint8Array(a.data.length + b.data.length);
  data.set(a.data, 0);
  data.set(b.data, a.data.length);
  return wavFile(a.layout, data);
}

interface ParsedWav {
  readonly layout: WavLayout;
  /** The sample data, cut to whole frames. */
  readonly data: Uint8Array;
}

/** Reads the PCM layout and sample data of a WAV file. Null for anything else. */
function parseWav(bytes: Uint8Array): ParsedWav | null {
  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let layout: WavLayout | null = null;
  let data: Uint8Array | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.length && data === null) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (body + 16 > bytes.length || view.getUint16(body, true) !== PCM_FORMAT_TAG) return null;
      layout = {
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        blockAlign: view.getUint16(body + 12, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    }
    if (id === 'data') {
      data = bytes.subarray(body, body + Math.min(size, bytes.length - body));
    }
    offset = body + size + (size % 2);
  }
  if (layout === null || data === null) return null;
  if (layout.channels < 1 || layout.rate < 1 || layout.blockAlign < 1) return null;
  const whole = data.length - (data.length % layout.blockAlign);
  return { layout, data: data.subarray(0, whole) };
}

/**
 * Joins two MP3 files into one by byte concatenation of their frames. The first file is kept as it
 * is, except for a trailing ID3v1 tag. The second loses its ID3v2 tag in front and its ID3v1 tag at
 * the end, so no tag sits between the frames.
 */
export function joinMp3(first: Uint8Array, second: Uint8Array): Uint8Array {
  const head = first.subarray(0, first.length - id3v1Length(first));
  const frames = second.subarray(id3v2Length(second), second.length - id3v1Length(second));
  const out = new Uint8Array(head.length + frames.length);
  out.set(head, 0);
  out.set(frames, head.length);
  return out;
}

/**
 * Duration of a WAV file from its `fmt ` byte rate and `data` length. A data chunk that claims more
 * bytes than the file holds (a truncated or streamed file) is measured by what is present. Returns
 * null when the bytes are not a readable WAV file.
 */
export function wavDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate: number | null = null;
  let dataLength: number | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ' && body + 12 <= bytes.length) byteRate = view.getUint32(body + 8, true);
    if (id === 'data') {
      dataLength = Math.min(size, bytes.length - body);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (byteRate === null || byteRate <= 0 || dataLength === null) return null;
  return Math.round((dataLength / byteRate) * 1000);
}

function writeAscii(out: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) out[offset + i] = text.charCodeAt(i);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(bytes[offset + i] ?? 0);
  return text;
}
