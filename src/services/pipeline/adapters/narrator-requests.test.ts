/*
 * The exact /audio/speech request body each narrator sends, through the real OpenRouter client and
 * the TTS adapter. Only the network is faked, so these bodies are what would go over the wire.
 */
import type { NarrationProfile } from '@/core/domain';
import {
  FREE_NARRATOR_MODEL_ID,
  GEMINI_NARRATOR_MODEL_ID,
  KOKORO_MODEL_ID,
  NARRATOR_OPTIONS,
} from '@/core/narration/options';
import { createOpenRouterClient } from '@/services/openrouter';
import type { RecordedCall } from '@/services/openrouter/__fixtures__/fake-fetch';

import { createTts } from './tts';


const TEXT = 'Ciao, benvenuti.';
const STYLE = 'Warm audiobook narrator with a measured pace.';

/** Records the request and answers with audio in the format the model really returns. */
function speechClient(answer: (call: RecordedCall) => Response) {
  const calls: RecordedCall[] = [];
  const client = createOpenRouterClient({
    getApiKey: async () => 'sk-or-v1-TESTKEY',
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    maxRetries: 0,
    fetchImpl: async (input, init) => {
      const call: RecordedCall = {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: JSON.parse(String(init?.body)),
        signal: init?.signal ?? undefined,
      };
      calls.push(call);
      return answer(call);
    },
  });
  return { client, calls };
}

const pcmReply = () =>
  new Response(new Uint8Array(48_000), {
    status: 200,
    headers: { 'content-type': 'audio/pcm;rate=24000;channels=1' },
  });
const mp3Reply = () =>
  new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });

function profileFor(id: string, voice: string, style: string | null): NarrationProfile {
  const option = NARRATOR_OPTIONS.find((entry) => entry.modelId === id);
  if (!option) throw new Error(`no narrator for ${id}`);
  return {
    id: `profile-${option.id}`,
    name: option.label,
    provider: 'openrouter',
    model: id,
    voice,
    style,
    speed: 1,
  };
}

describe('narrator speech requests', () => {
  it('Best quality sends Gemini the PCM format, its voice and the style', async () => {
    const { client, calls } = speechClient(pcmReply);

    await createTts({ openrouter: client }).synthesize({
      text: TEXT,
      profile: profileFor(GEMINI_NARRATOR_MODEL_ID, 'Kore', STYLE),
      signal: new AbortController().signal,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect(calls[0]?.body).toEqual({
      model: 'google/gemini-3.8-flash-lite-tts',
      input: TEXT,
      voice: 'Kore',
      response_format: 'pcm',
      speed: 1,
      instructions: STYLE,
    });
  });

  it('Budget sends Kokoro the Italian voice as MP3, with no style', async () => {
    const { client, calls } = speechClient(mp3Reply);

    await createTts({ openrouter: client }).synthesize({
      text: TEXT,
      profile: profileFor(KOKORO_MODEL_ID, 'if_sara', null),
      signal: new AbortController().signal,
    });

    expect(calls[0]?.body).toEqual({
      model: 'hexgrad/kokoro-82m',
      input: TEXT,
      voice: 'if_sara',
      response_format: 'mp3',
      speed: 1,
    });
  });

  it('Free sends Fish no voice, asks for MP3 first, and takes the format it names', async () => {
    const { client, calls } = speechClient((call) =>
      (call.body as { response_format: string }).response_format === 'mp3'
        ? new Response(
            JSON.stringify({ error: { message: 'This model only supports response_format=wav' } }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          )
        : new Response(new Uint8Array(48_000), {
            status: 200,
            headers: { 'content-type': 'audio/wav' },
          }),
    );

    const result = await createTts({ openrouter: client }).synthesize({
      text: TEXT,
      profile: profileFor(FREE_NARRATOR_MODEL_ID, '', null),
      signal: new AbortController().signal,
    });

    expect(calls.map((call) => call.body)).toEqual([
      { model: FREE_NARRATOR_MODEL_ID, input: TEXT, response_format: 'mp3', speed: 1 },
      { model: FREE_NARRATOR_MODEL_ID, input: TEXT, response_format: 'wav', speed: 1 },
    ]);
    expect(calls.every((call) => !('voice' in (call.body as object)))).toBe(true);
    expect(result.mime).toBe('audio/wav');
  });
});
