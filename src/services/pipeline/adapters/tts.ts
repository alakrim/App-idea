/*
 * Tts: one narration passage through OpenRouter's /audio/speech. The reply's content type decides
 * the container: MP3 is stored as MP3, WAV as WAV, and raw PCM (Gemini TTS) is wrapped in a WAV
 * header so every player can read it. The device voice cannot write a file, so a profile that uses
 * it cannot produce a stored segment.
 */
import { speechFormatFor, storableAudio } from '@/core/narration/formats';
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
        format: speechFormatFor(profile.model),
        speed: profile.speed,
        ...(profile.style === null ? {} : { instructions: profile.style }),
        signal,
      });
      const stored = storableAudio(
        new Uint8Array(reply.audio),
        reply.contentType,
        reply.formatUsed,
      );
      return {
        bytes: stored.bytes,
        mime: stored.mime,
        costUsd: reply.costUsd,
        generationId: reply.generationId,
      };
    },
  };
}
