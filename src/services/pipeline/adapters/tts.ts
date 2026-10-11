/*
 * Tts: one narration passage through OpenRouter's /audio/speech, as mp3. The device voice cannot
 * write a file, so a profile that uses it cannot produce a stored segment.
 */
import { StageFailure } from '@/core/pipeline/errors';
import type { Tts } from '@/core/pipeline/ports';
import type { OpenRouterClient } from '@/services/openrouter';

export interface TtsDeps {
  readonly openrouter: Pick<OpenRouterClient, 'synthesizeSpeech'>;
}

export function createTts({ openrouter }: TtsDeps): Tts {
  return {
    async synthesize({ text, profile, signal }) {
      if (profile.provider !== 'openrouter') {
        throw new StageFailure(
          'MODEL_UNAVAILABLE',
          'The device voice cannot save audio for later. Pick an OpenRouter voice in Settings.',
          { retryable: false, detail: 'device_voice' },
        );
      }
      const reply = await openrouter.synthesizeSpeech({
        model: profile.model,
        voice: profile.voice,
        input: text,
        format: 'mp3',
        speed: profile.speed,
        ...(profile.style === null ? {} : { instructions: profile.style }),
        signal,
      });
      return {
        bytes: new Uint8Array(reply.audio),
        mime: reply.contentType,
        costUsd: reply.costUsd,
      };
    },
  };
}
