import { pipelineFailure } from './errors';

import type { Transport } from './transport';

export type SpeechFormat = 'mp3' | 'pcm';

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

  return deps.transport.request(
    {
      method: 'POST',
      path: '/audio/speech',
      body: {
        model: input.model,
        input: input.input,
        voice: input.voice,
        response_format: input.format,
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
        contentType: res.headers.get('content-type') ?? DEFAULT_CONTENT_TYPE[input.format],
        generationId: res.headers.get('x-generation-id'),
        costUsd: null,
      };
    },
  );
}
