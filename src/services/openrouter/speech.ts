import type { SpeechFormat } from '@/core/narration/formats';

import { PipelineFailure, pipelineFailure } from './errors';

import type { Transport } from './transport';

export type { SpeechFormat } from '@/core/narration/formats';

/** Gemini TTS answers an mp3 request with this 400 message. The retry asks for pcm instead. */
const PCM_ONLY_PATTERN = /only supports response_format="pcm"/;

export interface SpeechInput {
  model: string;
  voice: string;
  input: string;
  format: SpeechFormat;
  /** Synthesis speed, 0.8 to 1.2 in the app. */
  speed?: number;
  /** Steering text, honoured by models such as Gemini TTS and gpt-4o-mini-tts. */
  instructions?: string;
  signal?: AbortSignal;
}

export interface SpeechResult {
  audio: ArrayBuffer;
  contentType: string;
  generationId: string | null;
  /** The speech endpoint returns no usage, so the cost is estimated with cost.ts. */
  costUsd: number | null;
  /** The format the audio is in. It differs from the one asked for when a PCM-only model was retried. */
  formatUsed: SpeechFormat;
}

interface SpeechDeps {
  transport: Transport;
  maxChars: number;
}

const DEFAULT_CONTENT_TYPE: Record<SpeechFormat, string> = {
  mp3: 'audio/mpeg',
  pcm: 'audio/pcm',
};

/** Synthesizes one passage with POST /audio/speech. The caller splits longer text first. */
export async function synthesizeSpeech(
  deps: SpeechDeps,
  input: SpeechInput,
): Promise<SpeechResult> {
  if (input.input.trim().length === 0) {
    throw pipelineFailure('CONTENT_EMPTY', 'There is no text to narrate.', { retryable: false });
  }
  if (input.input.length > deps.maxChars) {
    throw pipelineFailure(
      'INPUT_TOO_LONG',
      `This passage is longer than the narration limit of ${deps.maxChars} characters. Split it and try again.`,
      { retryable: false, detail: `length=${input.input.length} max=${deps.maxChars}` },
    );
  }

  const request = (format: SpeechFormat): Promise<SpeechResult> =>
    deps.transport.request(
      {
        method: 'POST',
        path: '/audio/speech',
        body: {
          model: input.model,
          input: input.input,
          voice: input.voice,
          response_format: format,
          speed: input.speed,
          instructions: input.instructions,
        },
        accept: 'audio/*',
        signal: input.signal,
      },
      async (res) => {
        const audio = await res.arrayBuffer();
        if (audio.byteLength === 0) {
          throw pipelineFailure('UNKNOWN', 'OpenRouter returned no audio. Try again.', {
            retryable: true,
          });
        }
        return {
          audio,
          contentType: res.headers.get('content-type') ?? DEFAULT_CONTENT_TYPE[format],
          generationId: res.headers.get('x-generation-id'),
          costUsd: null,
          formatUsed: format,
        };
      },
    );

  try {
    return await request(input.format);
  } catch (error) {
    // Self-healing: a model that only speaks PCM refuses mp3 once, and then the same text is
    // requested as PCM. The caller reads `formatUsed` to know what it received.
    if (input.format === 'mp3' && isPcmOnlyRefusal(error)) return request('pcm');
    throw error;
  }
}

function isPcmOnlyRefusal(error: unknown): boolean {
  return (
    error instanceof PipelineFailure &&
    error.error.detail !== undefined &&
    PCM_ONLY_PATTERN.test(error.error.detail)
  );
}
