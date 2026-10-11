import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PipelineFailure } from '@/services/openrouter';

import { cachedPreview, hasPaidPreviewConsent, recordPaidPreviewConsent, savePreview } from './preview-cache';
import { previewCacheKey } from './preview-sample';

import type { OpenRouterClient } from '@/services/openrouter';

export interface PreviewRequest {
  model: string;
  voice: string;
  speed: number;
  style: string | null;
  /** Language of the sample text, used in the cache key. */
  lang: string;
  text: string;
  /** Estimated OpenRouter cost of one synthesis, in USD. Shown in the one-time confirmation. */
  estimateUsd: number;
}

export type PreviewPhase = 'idle' | 'confirming' | 'loading' | 'ready' | 'error';

const GENERIC_FAILURE = 'The preview could not be made. Check your connection and try again.';

/**
 * Voice previews. A cached clip plays at no cost. A new clip needs the user's one-time consent
 * because it spends OpenRouter credits, and then it is synthesized, cached and played.
 */
export function useVoicePreview(client: OpenRouterClient) {
  const player = useAudioPlayer(null);
  const playback = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<PreviewPhase>('idle');
  const [pending, setPending] = useState<PreviewRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = controllerRef;
    return () => controller.current?.abort();
  }, []);

  const playUri = useCallback(
    (uri: string) => {
      player.replace({ uri });
      player.play();
      setPhase('ready');
    },
    [player],
  );

  const synthesize = useCallback(
    async (request: PreviewRequest, key: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setPhase('loading');
      setMessage(null);
      try {
        const result = await client.synthesizeSpeech({
          model: request.model,
          voice: request.voice,
          input: request.text,
          format: 'mp3',
          speed: request.speed,
          instructions: request.style ?? undefined,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        playUri(savePreview(key, result.audio).uri);
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof PipelineFailure ? error.error.message : GENERIC_FAILURE);
        setPhase('error');
      }
    },
    [client, playUri],
  );

  /** Plays a cached clip, or asks for consent first, or synthesizes straight away after consent. */
  const preview = useCallback(
    (request: PreviewRequest) => {
      const key = previewCacheKey(request);
      const cached = cachedPreview(key);
      if (cached) {
        playUri(cached.uri);
        return;
      }
      if (!hasPaidPreviewConsent()) {
        setPending(request);
        setPhase('confirming');
        return;
      }
      void synthesize(request, key);
    },
    [playUri, synthesize],
  );

  const confirm = useCallback(() => {
    if (pending === null) return;
    recordPaidPreviewConsent();
    setPending(null);
    void synthesize(pending, previewCacheKey(pending));
  }, [pending, synthesize]);

  const cancelConfirmation = useCallback(() => {
    setPending(null);
    setPhase('idle');
  }, []);

  return {
    phase,
    pending,
    message,
    isPlaying: playback.playing,
    preview,
    confirm,
    cancelConfirmation,
  };
}
