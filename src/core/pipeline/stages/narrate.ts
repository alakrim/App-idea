/*
 * The narrate stage (ADR-0008). The spoken text is planned into segments as its sentences become
 * final, and each segment is synthesized as soon as it is complete. Requests run in an adaptive
 * window, and the segments are saved and announced strictly in order, so the player always has a
 * contiguous prefix.
 *
 * A rerun reuses every saved segment whose sentences, text and voice still match, so it makes no
 * speech call for them. The stage's job hash is the hash of the final plan, written when the stage
 * completes. A passage that still fails after the transport's own retries is split in two and joined
 * (narrate-fallback), and a failure that survives that is reported with its passage number.
 */
import type { AudioSegment, NarrationProfile } from '@/core/domain';
import { throwIfCancelled } from '@/core/llm/transport';
import { wavDurationMs } from '@/core/narration/formats';
import {
  isLanguageSupported,
  narrateConcurrencyFor,
  optionFor,
  segmentLimitsFor,
} from '@/core/narration/options';
import { countCodePoints } from '@/core/text/build';
import { estimateSpeechSeconds } from '@/core/text/speech-rate';
import { estimateSentenceOffsets } from '@/core/text/timing';

import { StageFailure, toPipelineError } from '../errors';
import { stableHash } from '../hash';
import { mp3DurationMs } from '../mp3-duration';
import { AdaptiveWindow, SlidingWindow } from '../tts-pool';
import { synthesizeWithFallback } from './narrate-fallback';
import { joinSpoken, planFinalSegments } from './narrate-plan';
import { translationPair } from './translate';

import type { FlowContext, StageDefinition, StageExecution } from '../context';
import type { SpokenTextGate } from '../spoken-text';
import type { SegmentTiming } from '../tts-pool';
import type { SpokenClip } from './narrate-fallback';
import type { PlanOptions, PlannedSegment } from './narrate-plan';

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

export const narrateStage: StageDefinition<FlowContext> = {
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
function spokenLanguageOf(ctx: FlowContext): string | null {
  const pair = translationPair(ctx.record);
  if (pair !== null) return pair.targetLang;
  return ctx.record.chapter.sourceLang ?? ctx.record.series.sourceLang ?? null;
}

async function execute(ctx: FlowContext, profile: NarrationProfile): Promise<StageExecution> {
  const { chapters, audio } = ctx.ports;
  const lang = spokenLanguageOf(ctx);
  assertNarratorSpeaks(profile, lang);
  const plan: PlanOptions = {
    ...segmentLimitsFor(profile.model),
    lang,
    voiceKey: [profile.provider, profile.model, profile.voice, profile.style, profile.speed],
  };
  const existing = await chapters.listAudioSegments(ctx.chapterId);
  let savedChars = 0;

  /**
   * Announces a segment that is saved or reused, in order. The first segment also makes the chapter
   * playable, and progress advances with the characters that are saved.
   */
  /** The passage count, once the chapter's text is complete. Null while it can still grow. */
  const passageTotal = (): number | null =>
    ctx.spoken.complete ? planFinalSegments(ctx.spoken.prefix(), plan, true).length : null;

  const announce = (
    segment: PlannedSegment,
    uri: string,
    durationMs: number,
    synthesis: SegmentTiming | null,
  ): void => {
    savedChars += segment.chars;
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
        synthesis: synthesis === null ? null : { ms: synthesis.synthMs, slots: synthesis.slots },
      },
    });
    if (segment.idx === 0) ctx.emit({ type: 'playable', chapterId: ctx.chapterId });
    const estimate = Math.max(1, ctx.spoken.estimatedChars());
    // The passage count is shown once the total is known. Before that the copy says "passage N".
    const total = passageTotal();
    ctx.emit({
      type: 'progress',
      chapterId: ctx.chapterId,
      stage: 'narrate',
      progress: Math.min(1, savedChars / estimate),
      ...(total === null ? {} : { passages: { done: segment.idx + 1, total } }),
    });
  };

  const pool = new SlidingWindow<PlannedSegment, SpokenClip>({
    window: new AdaptiveWindow({ ceiling: narrateConcurrencyFor(profile.model) }),
    signal: ctx.signal,
    now: () => ctx.ports.clock.now(),
    work: (segment, signal) => narrateSegment(ctx, profile, segment, signal, passageTotal),
    save: async (segment, clip, timing) => {
      const ext = extensionFor(clip.mime);
      const uri = await audio.write(ctx.chapterId, segment.idx, clip.bytes, ext);
      await chapters.saveAudioSegment(toRow(ctx, segment, uri, clip.durationMs, profile));
      announce(segment, uri, clip.durationMs, timing);
    },
  });

  const finals: PlannedSegment[] = [];
  let reusing = true;
  let synthesized = 0;
  let lastEstimate = -1;
  for (let k = 0; ; k += 1) {
    const segment = await nextFinalSegment(ctx.spoken, ctx.signal, k, plan, (chars) => {
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
  if (existing.length > finals.length) {
    await chapters.deleteAudioFrom(ctx.chapterId, finals.length);
  }

  const saved = await chapters.listAudioSegments(ctx.chapterId);
  const durationMs = saved.reduce((sum, s) => sum + s.durationMs, 0);
  await chapters.setMeta(ctx.chapterId, { durationMs });
  return {
    inputHash: stableHash(['narrate', finals.map((s) => s.hash)]),
    status: synthesized === 0 ? 'skipped' : 'done',
  };
}

/**
 * Synthesizes one passage. A retryable failure that survives the split-and-join fallback is reported
 * with the passage number. The passages saved before it stay saved, so a retry resumes at this one.
 */
async function narrateSegment(
  ctx: FlowContext,
  profile: NarrationProfile,
  segment: PlannedSegment,
  signal: AbortSignal,
  passageTotal: () => number | null,
): Promise<SpokenClip> {
  try {
    return await synthesizeWithFallback(segment.sentenceTexts, (sentences) =>
      speakPassage(ctx, profile, sentences, signal),
    );
  } catch (thrown) {
    throw passageFailure(thrown, segment.idx + 1, passageTotal());
  }
}

/** One call to the narrator for `sentences`. The call is recorded, and its length is measured. */
async function speakPassage(
  ctx: FlowContext,
  profile: NarrationProfile,
  sentences: readonly string[],
  signal: AbortSignal,
): Promise<SpokenClip> {
  const text = joinSpoken(sentences);
  const result = await ctx.ports.tts.synthesize({ text, profile, signal });
  const durationMs = durationOf(extensionFor(result.mime), result.bytes, text);
  await ctx.meter.recordSpeech(profile.model, {
    chars: countCodePoints(text),
    audioSeconds: durationMs / 1000,
    costUsd: result.costUsd,
  });
  return { bytes: result.bytes, mime: result.mime, durationMs };
}

/**
 * The failure to show for a passage that could not be made. Only a retryable failure is reworded,
 * because a retry resumes at this passage. Anything else passes through unchanged.
 */
function passageFailure(thrown: unknown, passage: number, total: number | null): unknown {
  const error = toPipelineError(thrown);
  if (!error.retryable) return thrown;
  const which = total === null ? `passage ${passage}` : `passage ${passage} of ${total}`;
  return new StageFailure(
    error.code,
    `The narrator service didn't answer for ${which}. Your progress is saved. Tap Retry to continue.`,
    { retryable: true, ...(error.detail === undefined ? {} : { detail: error.detail }) },
  );
}

/**
 * Waits until segment `k` is final, and returns it. Returns null when the chapter is complete and has
 * no segment `k`. `onEstimate` reports the spoken character count each time the text changes.
 */
async function nextFinalSegment(
  spoken: SpokenTextGate,
  signal: AbortSignal,
  k: number,
  plan: PlanOptions,
  onEstimate: (chars: number) => void,
): Promise<PlannedSegment | null> {
  for (;;) {
    throwIfCancelled(signal);
    onEstimate(spoken.estimatedChars());
    const next = planFinalSegments(spoken.prefix(), plan, spoken.complete)[k];
    if (next !== undefined) return next;
    if (spoken.complete) return null;
    await spoken.waitForChange(signal);
  }
}

function toRow(
  ctx: FlowContext,
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
