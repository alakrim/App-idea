import type { SpeechFormat } from '@/core/narration/formats';
import { FREE_NARRATOR_DAILY_LIMIT_MESSAGE } from '@/core/narration/options';

import { PipelineFailure, pipelineFailure } from './errors';
import { CALL_TIMEOUTS_MS } from './transport';

import type { Transport } from './transport';

export type { SpeechFormat } from '@/core/narration/formats';

/**
 * A 400 that names the one format a speech model accepts, for example `only supports
 * response_format="pcm"` (Gemini TTS) or `only supports response_format=wav`. The first group
 * that matches gives the format for the single retry.
 */
const SUPPORTED_FORMAT_PATTERNS: readonly RegExp[] = [
  /only supports?\s+(?:response_format\s*[=:]\s*)?["']?(mp3|pcm|wav)\b/i,
  /supported (?:response[_ ])?formats?\s*(?:are|is|:)?\s*["']?(mp3|pcm|wav)\b/i,
];

export interface SpeechInput {
  model: string;
  /** The voice id. Empty for a model that takes no voice, and then the field is left out. */
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
  /** The format the audio is in. It differs from the one asked for when a model was retried. */
  formatUsed: SpeechFormat;
}

interface SpeechDeps {
  transport: Transport;
  maxChars: number;
}

const DEFAULT_CONTENT_TYPE: Record<SpeechFormat, string> = {
  mp3: 'audio/mpeg',
  pcm: 'audio/pcm',
  wav: 'audio/wav',
};

/** The format a speech model names when it refuses `requested`, or null when it names none. */
export function formatSupportedBy(message: string, requested: SpeechFormat): SpeechFormat | null {
  for (const pattern of SUPPORTED_FORMAT_PATTERNS) {
    const named = pattern.exec(message)?.[1]?.toLowerCase();
    if (named === 'mp3' || named === 'pcm' || named === 'wav') {
      return named === requested ? null : named;
    }
  }
  return null;
}

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
          // A model with no voices takes none. JSON.stringify drops an undefined field.
          voice: input.voice === '' ? undefined : input.voice,
          response_format: format,
          speed: input.speed,
          instructions: input.instructions,
        },
        accept: 'audio/*',
        signal: input.signal,
        timeoutMs: CALL_TIMEOUTS_MS.speech,
        dailyLimitMessage: FREE_NARRATOR_DAILY_LIMIT_MESSAGE,
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
    // Self-healing: a model that names the one format it accepts is asked again in that format,
    // once. The caller reads `formatUsed` to know what it received.
    const retryFormat = refusedFormatOf(error, input.format);
    if (retryFormat !== null) return request(retryFormat);
    throw error;
  }
}

function refusedFormatOf(error: unknown, requested: SpeechFormat): SpeechFormat | null {
  if (!(error instanceof PipelineFailure)) return null;
  const { detail } = error.error;
  return detail === undefined ? null : formatSupportedBy(detail, requested);
}
