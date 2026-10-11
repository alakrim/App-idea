import {
  DEFAULT_PCM_FORMAT,
  parsePcmContentType,
  pcmToWav,
  speechFormatFor,
  wavDurationMs,
} from './formats';

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
