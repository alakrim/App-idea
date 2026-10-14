import {
  containerOf,
  DEFAULT_PCM_FORMAT,
  joinMp3,
  joinWav,
  parsePcmContentType,
  pcmToWav,
  speechFormatFor,
  storableAudio,
  wavDurationMs,
} from './formats';
import { mp3DurationMs } from '../pipeline/mp3-duration';

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

/** `seconds` of 24 kHz mono silence, as 16-bit little-endian PCM. */
const pcmSeconds = (seconds: number, rate = 24_000, channels = 1): Uint8Array =>
  new Uint8Array(seconds * rate * channels * 2);

describe('speechFormatFor', () => {
  it('asks Gemini TTS models for PCM, because they refuse mp3', () => {
    expect(speechFormatFor('google/gemini-3.8-flash-lite-tts')).toBe('pcm');
    expect(speechFormatFor('google/gemini-2.5-flash-preview-tts')).toBe('pcm');
  });

  it('asks every other speech model for mp3', () => {
    expect(speechFormatFor('openai/gpt-4o-mini-tts')).toBe('mp3');
    expect(speechFormatFor('elevenlabs/eleven-v3')).toBe('mp3');
    expect(speechFormatFor('mistralai/voxtral-mini-tts')).toBe('mp3');
    expect(speechFormatFor('hexgrad/kokoro-82m')).toBe('mp3');
  });
});

describe('parsePcmContentType', () => {
  it('reads the rate and channels from the live content type', () => {
    expect(parsePcmContentType('audio/pcm;rate=24000;channels=1')).toEqual({
      rate: 24_000,
      channels: 1,
    });
  });

  it('reads other rates, channel counts and spacing', () => {
    expect(parsePcmContentType('audio/pcm; Rate = 44100 ; Channels = 2')).toEqual({
      rate: 44_100,
      channels: 2,
    });
  });

  it('takes the Gemini defaults when a parameter is missing or invalid', () => {
    expect(parsePcmContentType('audio/pcm')).toEqual(DEFAULT_PCM_FORMAT);
    expect(parsePcmContentType(null)).toEqual(DEFAULT_PCM_FORMAT);
    expect(parsePcmContentType(undefined)).toEqual(DEFAULT_PCM_FORMAT);
    expect(parsePcmContentType('audio/pcm;rate=abc;channels=0')).toEqual(DEFAULT_PCM_FORMAT);
    expect(parsePcmContentType('audio/pcm;rate=-8000;channels=1.5')).toEqual(DEFAULT_PCM_FORMAT);
  });

  it('keeps the valid parameter when the other one is invalid', () => {
    expect(parsePcmContentType('audio/pcm;rate=16000;channels=many')).toEqual({
      rate: 16_000,
      channels: 1,
    });
  });
});

describe('pcmToWav', () => {
  it('writes a 44-byte RIFF/WAVE header for 16-bit mono PCM', () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
    const wav = pcmToWav(pcm, { rate: 24_000, channels: 1 });
    const view = new DataView(wav.buffer);

    expect(wav.length).toBe(44 + pcm.length);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + pcm.length);
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(24_000); // sample rate
    expect(view.getUint32(28, true)).toBe(48_000); // byte rate: 24000 * 1 * 2
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(pcm.length);
    expect(Array.from(wav.subarray(44))).toEqual(Array.from(pcm));
  });

  it('computes the byte rate and block align for stereo', () => {
    const wav = pcmToWav(new Uint8Array(8), { rate: 44_100, channels: 2 });
    const view = new DataView(wav.buffer);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(44_100 * 4);
    expect(view.getUint16(32, true)).toBe(4);
  });

  it('drops a trailing partial frame so the data holds whole samples', () => {
    const wav = pcmToWav(new Uint8Array([1, 2, 3]), { rate: 24_000, channels: 1 });
    expect(wav.length).toBe(44 + 2);
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(2);
  });

  it('refuses a rate or channel count that is not a positive integer', () => {
    expect(() => pcmToWav(new Uint8Array(2), { rate: 0, channels: 1 })).toThrow(RangeError);
    expect(() => pcmToWav(new Uint8Array(2), { rate: 24_000, channels: 0 })).toThrow(RangeError);
    expect(() => pcmToWav(new Uint8Array(2), { rate: 24_000.5, channels: 1 })).toThrow(RangeError);
  });
});

describe('wavDurationMs', () => {
  it('gives the exact duration of a WAV written by pcmToWav', () => {
    expect(wavDurationMs(pcmToWav(pcmSeconds(2), DEFAULT_PCM_FORMAT))).toBe(2_000);
    expect(wavDurationMs(pcmToWav(pcmSeconds(1.5, 16_000, 2), { rate: 16_000, channels: 2 }))).toBe(
      1_500,
    );
  });

  it('measures a truncated data chunk by the bytes actually present', () => {
    const wav = pcmToWav(pcmSeconds(1), DEFAULT_PCM_FORMAT);
    const cut = wav.subarray(0, wav.length - 24_000);
    expect(wavDurationMs(cut)).toBe(500);
  });

  it('returns null for bytes that are not a WAV file', () => {
    expect(wavDurationMs(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBeNull();
    expect(wavDurationMs(new Uint8Array(0))).toBeNull();
    const noFormat = new Uint8Array(12 + 8);
    noFormat.set(new TextEncoder().encode('RIFFxxxxWAVE'), 0);
    noFormat.set(new TextEncoder().encode('data'), 12);
    expect(wavDurationMs(noFormat)).toBeNull();
  });
});

describe('containerOf and storableAudio', () => {
  const pcm = new Uint8Array([1, 0, 2, 0]);

  it('reads the container from the content type before the requested format', () => {
    expect(containerOf('audio/pcm;rate=24000;channels=1', 'mp3')).toBe('pcm');
    expect(containerOf('audio/wav', 'mp3')).toBe('wav');
    expect(containerOf('audio/x-wav', 'pcm')).toBe('wav');
    expect(containerOf('audio/mpeg', 'wav')).toBe('mp3');
    expect(containerOf('audio/mp3', 'pcm')).toBe('mp3');
  });

  it('falls back to the requested format for an unknown or missing content type', () => {
    expect(containerOf('application/octet-stream', 'mp3')).toBe('mp3');
    expect(containerOf(null, 'wav')).toBe('wav');
    expect(containerOf(undefined, 'pcm')).toBe('pcm');
  });

  it('wraps PCM as WAV with the rate from its content type', () => {
    const stored = storableAudio(pcm, 'audio/pcm;rate=16000;channels=1', 'pcm');
    expect(stored.mime).toBe('audio/wav');
    expect(stored.bytes).toEqual(pcmToWav(pcm, { rate: 16_000, channels: 1 }));
  });

  it('stores WAV and MP3 as they are', () => {
    const wav = new Uint8Array([82, 73, 70, 70]);
    expect(storableAudio(wav, 'audio/wav', 'wav')).toEqual({ bytes: wav, mime: 'audio/wav' });
    const mp3 = new Uint8Array([0xff, 0xfb]);
    expect(storableAudio(mp3, 'audio/mpeg', 'mp3')).toEqual({ bytes: mp3, mime: 'audio/mpeg' });
  });
});

/** MPEG-1 Layer III frames at 44.1 kHz, 128 kbit/s: 417 bytes and 1,152 samples each. */
function mp3Frames(count: number): Uint8Array {
  const out = new Uint8Array(417 * count);
  for (let i = 0; i < count; i += 1) out.set([0xff, 0xfb, 0x90, 0x00], i * 417);
  return out;
}

function id3v2Tag(payload: number): Uint8Array {
  const out = new Uint8Array(10 + payload);
  out.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, (payload >> 7) & 0x7f, payload & 0x7f], 0);
  out.fill(0x55, 10);
  return out;
}

function id3v1Tag(): Uint8Array {
  const out = new Uint8Array(128).fill(0x20);
  out.set([0x54, 0x41, 0x47], 0);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('joinWav', () => {
  it('joins two PCM WAV files under one header, with the samples of both in order', () => {
    const a = pcmToWav(new Uint8Array(24_000 * 2 * 3).fill(1), { rate: 24_000, channels: 1 });
    const b = pcmToWav(new Uint8Array(24_000 * 2 * 2).fill(2), { rate: 24_000, channels: 1 });

    const joined = joinWav(a, b);

    expect(joined).not.toBeNull();
    const out = joined as Uint8Array;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(out.length).toBe(44 + 24_000 * 2 * 5);
    expect(view.getUint32(4, true)).toBe(36 + 24_000 * 2 * 5);
    expect(view.getUint32(40, true)).toBe(24_000 * 2 * 5);
    expect(out.subarray(44, 44 + 24_000 * 2 * 3)).toEqual(a.subarray(44));
    expect(out.subarray(44 + 24_000 * 2 * 3)).toEqual(new Uint8Array(24_000 * 2 * 2).fill(2));
  });

  it('gives the duration as the sum of the two halves', () => {
    const a = pcmToWav(new Uint8Array(24_000 * 2 * 3), { rate: 24_000, channels: 1 });
    const b = pcmToWav(new Uint8Array(24_000 * 2 * 2), { rate: 24_000, channels: 1 });
    const joined = joinWav(a, b) as Uint8Array;

    expect(wavDurationMs(joined)).toBe(5_000);
    expect(wavDurationMs(joined)).toBe((wavDurationMs(a) ?? 0) + (wavDurationMs(b) ?? 0));
  });

  it('refuses halves whose rate or channel count differ', () => {
    const mono24 = pcmToWav(new Uint8Array(96), { rate: 24_000, channels: 1 });
    const mono16 = pcmToWav(new Uint8Array(96), { rate: 16_000, channels: 1 });
    const stereo24 = pcmToWav(new Uint8Array(96), { rate: 24_000, channels: 2 });

    expect(joinWav(mono24, mono16)).toBeNull();
    expect(joinWav(mono24, stereo24)).toBeNull();
  });

  it('refuses bytes that are not a PCM WAV file', () => {
    const wav = pcmToWav(new Uint8Array(96), { rate: 24_000, channels: 1 });

    expect(joinWav(wav, mp3Frames(2))).toBeNull();
    expect(joinWav(mp3Frames(2), wav)).toBeNull();
  });

  it('measures a truncated second half by the data it holds', () => {
    const a = pcmToWav(new Uint8Array(96), { rate: 24_000, channels: 1 });
    const full = pcmToWav(new Uint8Array(24_000 * 2), { rate: 24_000, channels: 1 });
    const truncated = full.subarray(0, full.length - 1_000);

    const joined = joinWav(a, truncated) as Uint8Array;

    expect(joined.length).toBe(44 + 96 + (truncated.length - 44));
  });
});

describe('joinMp3', () => {
  it('concatenates the frames of both files', () => {
    const a = mp3Frames(2);
    const b = mp3Frames(3);

    expect(joinMp3(a, b)).toEqual(concat(a, b));
  });

  it('strips the ID3 tags of the second half, and keeps the first half as it is', () => {
    const a = concat(id3v2Tag(20), mp3Frames(2));
    const b = concat(id3v2Tag(40), mp3Frames(3));

    expect(joinMp3(a, b)).toEqual(concat(a, mp3Frames(3)));
  });

  it('strips a trailing ID3v1 tag from both halves', () => {
    const a = concat(mp3Frames(2), id3v1Tag());
    const b = concat(mp3Frames(3), id3v1Tag());

    expect(joinMp3(a, b)).toEqual(concat(mp3Frames(2), mp3Frames(3)));
  });

  it('plays as one file of the frames of both halves', () => {
    const joined = joinMp3(concat(id3v2Tag(20), mp3Frames(2)), concat(id3v2Tag(20), mp3Frames(3)));

    // Five 1,152-sample frames at 44.1 kHz.
    expect(mp3DurationMs(joined)).toBe(Math.round((5 * 1152 * 1000) / 44_100));
  });
});
