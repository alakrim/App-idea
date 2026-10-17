/*
 * The narrate stage (ADR-0008). The spoken text is planned into segments as its sentences become
 * final, and each segment is synthesized as soon as it is complete. Requests run in an adaptive
 * window, and the segments are saved and announced strictly in order, so the player always has a
 * contiguous prefix.
 *
 * A rerun reuses every saved segment whose sentences, text and voice still match, so it makes no
 * speech call for them. The stage's job hash is the hash of the final plan, written when the stage
 * completes.
 */
import type { AudioSegment, NarrationProfile } from '@/core/domain';
import { throwIfCancelled } from '@/core/llm/transport';
import { wavDurationMs } from '@/core/narration/formats';
import { isLanguageSupported, optionFor, segmentMaxCharsFor } from '@/core/narration/options';
import { estimateSpeechSeconds } from '@/core/text/speech-rate';
import { estimateSentenceOffsets } from '@/core/text/timing';

import { StageFailure } from '../errors';
import { stableHash } from '../hash';
import { mp3DurationMs } from '../mp3-duration';
import { AdaptiveWindow, SlidingWindow } from '../tts-pool';

import { planFinalSegments } from './narrate-plan';
import { translationPair } from './translate';

import type { StageContext, StageDefinition, StageExecution } from '../context';
import type { TtsResult } from '../ports';
import type { SpokenTextGate } from '../spoken-text';
import type { PlannedSegment } from './narrate-plan';

/** English names for the messages below. Unlisted languages show their code. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  ar: 'Arabic',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  hi: 'Hindi',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  pl: 'Polish',
  pt: 'Portuguese',
  ru: 'Russian',
  sv: 'Swedish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  zh: 'Chinese',
};

/**
 * Stops before any paid call when the chosen narrator cannot read the chapter's language (the
 * Budget narrator speaks 8 languages). Sending it anyway would buy unusable audio.
 */
function assertNarratorSpeaks(profile: NarrationProfile, spokenLang: string | null): void {
  const option = optionFor(profile.model);
  if (option === null || spokenLang === null || isLanguageSupported(option, spokenLang)) return;
  const family = spokenLang.split('-')[0]?.toLowerCase() ?? spokenLang;
  const name = LANGUAGE_NAMES[family] ?? spokenLang;
  throw new StageFailure(
    'MODEL_UNAVAILABLE',
    `The ${option.label} narrator can't read ${name}. Choose Best quality or Free in Settings → Narration, then retry.`,
    { retryable: false, detail: `${profile.model} does not support ${spokenLang}` },
  );
}

/**
 * The free narrator (`:free`) is rate-limited per model, so it gets one request at a time. Every
 * other narrator uses the adaptive window.
 */
function isPinnedNarrator(modelId: string): boolean {
  return modelId.endsWith(':free');
}

export const narrateStage: StageDefinition = {
  stage: 'narrate',
  async prepare(ctx) {
    // The job hash is only known once the text is final, so the stage always runs and reuses audio.
    const model = await ctx.ports.catalog.find(ctx.record.narration.model);
    const profile: NarrationProfile = model?.supportsStyle
      ? ctx.record.narration
      : { ...ctx.record.narration, style: null };
    return {
      inputHash: null,
      model: profile.model,
      promptVersion: null,
      skip: false,
      execute: () => execute(ctx, profile),
    };
  },
};

/** The language being read aloud: the translation's when there is one, else the source's. */
function spokenLanguageOf(ctx: StageContext): string | null {
  const pair = translationPair(ctx.record);
  if (pair !== null) return pair.targetLang;
  return ctx.record.chapter.sourceLang ?? ctx.record.series.sourceLang ?? null;
}

async function execute(ctx: StageContext, profile: NarrationProfile): Promise<StageExecution> {
  const { chapters, audio, tts } = ctx.ports;
  assertNarratorSpeaks(profile, spokenLanguageOf(ctx));
  const plan = {
    maxChars: segmentMaxCharsFor(profile.model),
    voiceKey: [profile.provider, profile.model, profile.voice, profile.style, profile.speed],
  };
  const existing = await chapters.listAudioSegments(ctx.chapterId);
  const pool = new SlidingWindow<PlannedSegment, TtsResult>({
    window: new AdaptiveWindow({ pinned: isPinnedNarrator(profile.model) }),
    signal: ctx.signal,
    now: () => ctx.ports.clock.now(),
    work: (segment, signal) => tts.synthesize({ text: segment.text, profile, signal }),
    save: async (segment, result, timing) => {
      const ext = extensionFor(result.mime);
      const uri = await audio.write(ctx.chapterId, segment.idx, result.bytes, ext);
      const durationMs = durationOf(ext, result.bytes, segment.text);
      await ctx.meter.recordSpeech(profile.model, {
        chars: segment.chars,
        audioSeconds: durationMs / 1000,
        costUsd: result.costUsd,
      });
      await chapters.saveAudioSegment(toRow(ctx, segment, uri, durationMs, profile));
      announce(segment, uri, durationMs, { ms: timing.synthMs, slots: timing.slots });
    },
  });

  let savedChars = 0;
  /** Announces a saved or reused segment: the segment event, the playable flag and progress. */
  const announce = (
    segment: PlannedSegment,
    uri: string,
    durationMs: number,
    synthesis: SegmentTiming | null,
  ): void => {
    savedChars += segment.chars;
    emitSegment(ctx, segment, uri, durationMs, synthesis);
    const progress = Math.min(1, savedChars / Math.max(1, ctx.spoken.estimatedChars()));
    ctx.emit({ type: 'progress', chapterId: ctx.chapterId, stage: 'narrate', progress });
  };

  const finals: PlannedSegment[] = [];
  let reusing = true;
  let synthesized = 0;
  let lastEstimate = -1;
  for (let k = 0; ; k += 1) {
    const segment = await nextFinalSegment(ctx, k, plan, (chars) => {
      if (chars === lastEstimate) return;
      lastEstimate = chars;
      ctx.emit({ type: 'spokenChars', chapterId: ctx.chapterId, chars });
    });
    if (segment === null) break;
    finals.push(segment);

    const stored = existing[k];
    if (reusing && stored !== undefined && matches(stored, segment)) {
      announce(segment, stored.fileUri, stored.durationMs, null);
      continue;
    }
    if (reusing) {
      reusing = false;
      if (existing.length > k) await chapters.deleteAudioFrom(ctx.chapterId, k);
    }
    synthesized += 1;
    await pool.submit(segment);
  }
  await pool.finish();
  if (existing.length > finals.length) await chapters.deleteAudioFrom(ctx.chapterId, finals.length);

  const saved = await chapters.listAudioSegments(ctx.chapterId);
  const durationMs = saved.reduce((sum, s) => sum + s.durationMs, 0);
  await chapters.setMeta(ctx.chapterId, { durationMs });
  return {
    inputHash: stableHash(['narrate', finals.map((s) => s.hash)]),
    status: synthesized === 0 ? 'skipped' : 'done',
  };
}

/**
 * Waits until segment `k` is final, and returns it. Returns null when the chapter is complete and has
 * no segment `k`. `onEstimate` reports the spoken character count each time the text changes.
 */
async function nextFinalSegment(
  ctx: StageContext,
  k: number,
  plan: { readonly maxChars: number; readonly voiceKey: readonly unknown[] },
  onEstimate: (chars: number) => void,
): Promise<PlannedSegment | null> {
  const spoken: SpokenTextGate = ctx.spoken;
  for (;;) {
    throwIfCancelled(ctx.signal);
    onEstimate(spoken.estimatedChars());
    const segments = planFinalSegments(spoken.prefix(), plan, spoken.complete);
    const next = segments[k];
    if (next !== undefined) return next;
    if (spoken.complete) return null;
    await spoken.waitForChange(ctx.signal);
  }
}

/**
 * Announces a segment that is saved, or reused. The first one of the run also makes the chapter
 * playable, and progress advances with the characters that are saved.
 */
function announce(
  ctx: StageContext,
  segment: PlannedSegment,
  uri: string,
  durationMs: number,
  synthesis: { readonly synthMs: number; readonly slots: number } | null,
): void {
  ctx.emit({
    type: 'segmentReady',
    chapterId: ctx.chapterId,
    segment: {
      idx: segment.idx,
      sentenceStart: segment.sentenceStart,
      sentenceEnd: segment.sentenceEnd,
      durationMs,
      uri,
      chars: segment.chars,
      synthesis:
        synthesis === null ? null : { ms: synthesis.synthMs, slots: synthesis.slots },
    },
  });
  if (segment.idx === 0) ctx.emit({ type: 'playable', chapterId: ctx.chapterId });
  ctx.emit({
    type: 'progress',
    chapterId: ctx.chapterId,
    stage: 'narrate',
    progress: Math.min(1, (segment.sentenceEnd + 1) / Math.max(1, ctx.spoken.prefix().length)),
  });
}

function toRow(
  ctx: StageContext,
  segment: PlannedSegment,
  uri: string,
  durationMs: number,
  profile: NarrationProfile,
): AudioSegment {
  return {
    id: ctx.ports.ids(),
    chapterId: ctx.chapterId,
    idx: segment.idx,
    sentenceStart: segment.sentenceStart,
    sentenceEnd: segment.sentenceEnd,
    fileUri: uri,
    durationMs,
    sentenceOffsetsMs: estimateSentenceOffsets(segment.sentenceTexts, durationMs),
    profileId: profile.id,
    inputHash: segment.hash,
  };
}

/** The exact length from the file header when the format has one, else an estimate from the text. */
function durationOf(ext: string, bytes: Uint8Array, text: string): number {
  const measured = measureDurationMs(ext, bytes);
  if (measured !== null && measured > 0) return measured;
  return Math.max(1, Math.round(estimateSpeechSeconds(text) * 1000));
}

function matches(stored: AudioSegment, planned: PlannedSegment): boolean {
  return (
    stored.idx === planned.idx &&
    stored.sentenceStart === planned.sentenceStart &&
    stored.sentenceEnd === planned.sentenceEnd &&
    stored.inputHash === planned.hash
  );
}

/** Exact length from the file header when the format has one (MP3 frames, WAV data), else null. */
function measureDurationMs(ext: string, bytes: Uint8Array): number | null {
  if (ext === 'mp3') return mp3DurationMs(bytes);
  if (ext === 'wav') return wavDurationMs(bytes);
  return null;
}

function extensionFor(mime: string): string {
  const type = mime.toLowerCase();
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  return 'bin';
}
