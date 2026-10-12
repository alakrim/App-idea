/*
 * The split-and-join fallback for one stubborn narration passage. A passage of two or more
 * sentences that still fails with a retryable server or network error after the transport's own
 * retries is split at the sentence boundary nearest its middle. Both halves are synthesized once
 * each, and the two clips are joined into one. Anything else keeps the original failure, so a
 * half-made passage is never saved.
 */
import { joinMp3, joinWav } from '@/core/narration/formats';

import { toPipelineError } from '../errors';

import type { ErrorCode } from '@/core/domain';

/** Codes whose failure can change when the passage is shorter: a server error or a network failure. */
const SPLITTABLE_CODES: readonly ErrorCode[] = ['UNKNOWN', 'NETWORK'];

/** One synthesized passage: its audio, the MIME type it came in, and its measured length. */
export interface SpokenClip {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly durationMs: number;
}

/** The container a clip is stored in, or null for a type the app cannot join or play. */
export function audioContainer(mime: string): 'mp3' | 'wav' | null {
  const type = mime.toLowerCase();
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  return null;
}

/** Whether the failure is one a shorter passage may get past: a server error or a network failure. */
export function isSplittableFailure(thrown: unknown): boolean {
  const error = toPipelineError(thrown);
  return error.retryable && SPLITTABLE_CODES.includes(error.code);
}

/**
 * Splits sentences into two runs at the boundary nearest the middle of their characters. Null for
 * fewer than two sentences, since one sentence cannot be split.
 */
export function splitAtMidpoint(
  sentences: readonly string[],
): readonly [readonly string[], readonly string[]] | null {
  if (sentences.length < 2) return null;
  const half = sentences.reduce((sum, sentence) => sum + sentence.length, 0) / 2;
  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  let before = 0;
  for (let boundary = 1; boundary < sentences.length; boundary += 1) {
    before += sentences[boundary - 1]?.length ?? 0;
    const gap = Math.abs(before - half);
    if (gap < bestGap) {
      best = boundary;
      bestGap = gap;
    }
  }
  return [sentences.slice(0, best), sentences.slice(best)];
}

/**
 * Synthesizes the sentences with `speak`. When that fails with a splittable error and there are two
 * or more sentences, the halves are spoken once each and joined. Any other failure, and any failure
 * of a half, rethrows the original error.
 */
export async function synthesizeWithFallback(
  sentences: readonly string[],
  speak: (sentences: readonly string[]) => Promise<SpokenClip>,
): Promise<SpokenClip> {
  try {
    return await speak(sentences);
  } catch (thrown) {
    const halves = isSplittableFailure(thrown) ? splitAtMidpoint(sentences) : null;
    if (halves === null) throw thrown;
    const joined = await speakHalves(halves, speak);
    if (joined === null) throw thrown;
    return joined;
  }
}

/** Speaks both halves in order. Null when either fails, so the caller keeps the original error. */
async function speakHalves(
  halves: readonly [readonly string[], readonly string[]],
  speak: (sentences: readonly string[]) => Promise<SpokenClip>,
): Promise<SpokenClip | null> {
  try {
    const first = await speak(halves[0]);
    const second = await speak(halves[1]);
    return joinClips(first, second);
  } catch {
    return null;
  }
}

/**
 * Joins two clips of the same container into one, with the durations added. Null when the MIME
 * types differ, or when either clip cannot be joined (for example, it is not a readable WAV file).
 */
export function joinClips(first: SpokenClip, second: SpokenClip): SpokenClip | null {
  if (first.mime !== second.mime) return null;
  const container = audioContainer(first.mime);
  const bytes =
    container === 'wav'
      ? joinWav(first.bytes, second.bytes)
      : container === 'mp3'
        ? joinMp3(first.bytes, second.bytes)
        : null;
  if (bytes === null) return null;
  return { bytes, mime: first.mime, durationMs: first.durationMs + second.durationMs };
}
