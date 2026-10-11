import type { NarrationProfile } from '@/core/domain';
import { pcmToWav, wavDurationMs } from '@/core/narration/formats';
import { StageFailure } from '@/core/pipeline/errors';
import type { OpenRouterClient } from '@/services/openrouter';

import { createTts } from './tts';

type SpeechReply = Awaited<ReturnType<OpenRouterClient['synthesizeSpeech']>>;
type SpeechInput = Parameters<OpenRouterClient['synthesizeSpeech']>[0];

const GEMINI: NarrationProfile = {
  id: 'profile-gemini',
  name: 'Gemini Kore',
  provider: 'openrouter',
  model: 'google/gemini-3.8-flash-lite-tts',
  voice: 'Kore',
  style: null,
  speed: 1,
};

const MP3_MODEL: NarrationProfile = {
  ...GEMINI,
  id: 'profile-mp3',
  model: 'openai/gpt-4o-mini-tts',
  voice: 'alloy',
};

/** A fake client that records each request and answers with `reply`. */
function fakeClient(reply: (input: SpeechInput) => SpeechReply) {
  const requests: SpeechInput[] = [];
  const openrouter: Pick<OpenRouterClient, 'synthesizeSpeech'> = {
    synthesizeSpeech: async (input) => {
      requests.push(input);
      return reply(input);
    },
  };
  return { openrouter, requests };
}

const reply = (overrides: Partial<SpeechReply>): SpeechReply => ({
  audio: new Uint8Array([1, 0, 2, 0]).buffer,
  contentType: 'audio/mpeg',
  generationId: null,
  costUsd: null,
  formatUsed: 'mp3',
  ...overrides,
});

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

describe('createTts', () => {
  it('asks a PCM-only model for pcm and returns its audio as a WAV file', async () => {
    const pcm = new Uint8Array(24_000 * 2 * 2); // two seconds of 24 kHz mono
    const { openrouter, requests } = fakeClient(() =>
      reply({
        audio: pcm.buffer,
        contentType: 'audio/pcm;rate=24000;channels=1',
        formatUsed: 'pcm',
      }),
    );

    const result = await createTts({ openrouter }).synthesize({
      text: 'Chapter one.',
      profile: GEMINI,
      signal: new AbortController().signal,
    });

    expect(requests[0]?.format).toBe('pcm');
    expect(result.mime).toBe('audio/wav');
    expect(ascii(result.bytes, 0, 4)).toBe('RIFF');
    expect(ascii(result.bytes, 8, 4)).toBe('WAVE');
    expect(result.bytes.length).toBe(44 + pcm.length);
    expect(wavDurationMs(result.bytes)).toBe(2_000);
    expect(result.bytes).toEqual(pcmToWav(pcm, { rate: 24_000, channels: 1 }));
  });

  it('keeps MP3 audio as MP3 for models that take it', async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const { openrouter, requests } = fakeClient(() => reply({ audio: mp3.buffer }));

    const result = await createTts({ openrouter }).synthesize({
      text: 'Chapter one.',
      profile: MP3_MODEL,
      signal: new AbortController().signal,
    });

    expect(requests[0]?.format).toBe('mp3');
    expect(result.mime).toBe('audio/mpeg');
    expect(Array.from(result.bytes)).toEqual(Array.from(mp3));
  });

  it('converts the audio when a model that asked for mp3 was answered in PCM after the retry', async () => {
    const pcm = new Uint8Array(24_000 * 2);
    const { openrouter } = fakeClient(() =>
      reply({
        audio: pcm.buffer,
        contentType: 'audio/pcm;rate=24000;channels=1',
        formatUsed: 'pcm',
      }),
    );

    const result = await createTts({ openrouter }).synthesize({
      text: 'Chapter one.',
      profile: MP3_MODEL,
      signal: new AbortController().signal,
    });

    expect(result.mime).toBe('audio/wav');
    expect(wavDurationMs(result.bytes)).toBe(1_000);
  });

  it('refuses the device voice, because it cannot save a file', async () => {
    const { openrouter, requests } = fakeClient(() => reply({}));
    const error = await createTts({ openrouter })
      .synthesize({
        text: 'Hi.',
        profile: { ...GEMINI, provider: 'device' },
        signal: new AbortController().signal,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StageFailure);
    expect((error as StageFailure).error).toMatchObject({
      code: 'MODEL_UNAVAILABLE',
      retryable: false,
      detail: 'device_voice',
    });
    expect(requests).toHaveLength(0);
  });
});

describe('createTts: containers and voiceless narrators', () => {
  const FREE: NarrationProfile = {
    ...MP3_MODEL,
    id: 'profile-free',
    model: 'fish-audio/s2.1-pro-free:free',
    voice: '',
  };

  it('stores a WAV reply as WAV, with its header intact', async () => {
    const wav = pcmToWav(new Uint8Array(24_000 * 2), { rate: 24_000, channels: 1 });
    const { openrouter, requests } = fakeClient(() =>
      reply({ audio: Uint8Array.from(wav).buffer, contentType: 'audio/wav', formatUsed: 'wav' }),
    );

    const result = await createTts({ openrouter }).synthesize({
      text: 'Chapter one.',
      profile: { ...MP3_MODEL, model: 'fish-audio/s2.1-pro-free:free' },
      signal: new AbortController().signal,
    });

    expect(requests[0]?.format).toBe('mp3');
    expect(result.mime).toBe('audio/wav');
    expect(result.bytes).toEqual(wav);
    expect(wavDurationMs(result.bytes)).toBe(1_000);
  });

  it('sends an empty voice so the request omits it, and stores the MP3 reply', async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const { openrouter, requests } = fakeClient(() => reply({ audio: mp3.buffer }));

    const result = await createTts({ openrouter }).synthesize({
      text: 'Chapter one.',
      profile: FREE,
      signal: new AbortController().signal,
    });

    expect(requests[0]?.voice).toBe('');
    expect(result.mime).toBe('audio/mpeg');
    expect(Array.from(result.bytes)).toEqual(Array.from(mp3));
  });
});
