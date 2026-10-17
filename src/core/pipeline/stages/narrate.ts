/*
<<<<<<< HEAD
 * The narrate stage (ADR-0008). The spoken text is planned into segments as its sentences become
 * final, and each segment is synthesized as soon as it is complete. Requests run in an adaptive
 * window, and the segments are saved and announced strictly in order, so the player always has a
 * contiguous prefix.
 *
 * A rerun reuses every saved segment whose sentences, text and voice still match, so it makes no
 * speech call for them. The stage's job hash is the hash of the final plan, written when the stage
 * completes.
=======
 * The narrate stage: the spoken text (translation when present, else the original) is grouped into
 * segments and synthesized a few at a time. Segments are saved and emitted in order, so each one is
 * playable as soon as it is saved, and playback can start before the chapter is finished. A rerun
 * resumes at the first segment that is missing or was made from different input (a new voice, a new
 * style, or edited text).
>>>>>>> 54b3d2e
 */
import { runOrdered } from '@/core/async/ordered-pool';
import type { AudioSegment, NarrationProfile } from '@/core/domain';
import { wavDurationMs } from '@/core/narration/formats';
<<<<<<< HEAD
import { isLanguageSupported, optionFor, segmentMaxCharsFor } from '@/core/narration/options';
=======
import {
  isLanguageSupported,
  narrateConcurrencyFor,
  optionFor,
  segmentLimitsFor,
} from '@/core/narration/options';
import { countCodePoints } from '@/core/text/build';
import { planTtsSegments } from '@/core/text/chunk';
import { detectScript } from '@/core/text/normalize';
>>>>>>> 54b3d2e
import { estimateSpeechSeconds } from '@/core/text/speech-rate';
import { estimateSentenceOffsets } from '@/core/text/timing';

import { StageFailure, toPipelineError } from '../errors';
import { stableHash } from '../hash';
import { mp3DurationMs } from '../mp3-duration';
<<<<<<< HEAD
import { AdaptiveWindow, SlidingWindow } from '../tts-pool';
import { planFinalSegments } from './narrate-plan';
import { translationPair } from './translate';

import type { FlowContext, StageDefinition, StageExecution } from '../context';
import type { TtsResult } from '../ports';
import type { SpokenTextGate } from '../spoken-text';
import type { SegmentTiming } from '../tts-pool';
import type { PlanOptions, PlannedSegment } from './narrate-plan';
=======
import { audioContainer, synthesizeWithFallback } from './narrate-fallback';

import type { StageContext, StageDefinition } from '../context';
import type { StoredSentence } from '../ports';
import type { SpokenClip } from './narrate-fallback';

interface PlannedSegment {
  readonly idx: number;
  readonly sentenceStart: number;
  readonly sentenceEnd: number;
  readonly sentenceTexts: readonly string[];
  readonly text: string;
  readonly chars: number;
  readonly hash: string;
}

interface Plan {
  readonly profile: NarrationProfile;
  readonly segments: readonly PlannedSegment[];
  /** The language being read aloud: the translation's when there is one, else the source's. */
  readonly spokenLang: string | null;
  /** Speech requests in flight at once, for this narrator. */
  readonly concurrency: number;
}

/** A synthesized segment, ready to be saved. */
interface MadeSegment {
  readonly segment: PlannedSegment;
  readonly uri: string;
  readonly durationMs: number;
}
>>>>>>> 54b3d2e

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

<<<<<<< HEAD
/** The language being read aloud: the translation's when there is one, else the source's. */
function spokenLanguageOf(ctx: FlowContext): string | null {
  const pair = translationPair(ctx.record);
  if (pair !== null) return pair.targetLang;
  return ctx.record.chapter.sourceLang ?? ctx.record.series.sourceLang ?? null;
}

async function execute(ctx: FlowContext, profile: NarrationProfile): Promise<StageExecution> {
  const { chapters, audio, tts } = ctx.ports;
  const lang = spokenLanguageOf(ctx);
  assertNarratorSpeaks(profile, lang);
  const plan: PlanOptions = {
    maxChars: segmentMaxCharsFor(profile.model),
    lang,
    voiceKey: [profile.provider, profile.model, profile.voice, profile.style, profile.speed],
  };
=======
async function buildPlan(ctx: StageContext): Promise<Plan> {
  const sentences = await ctx.ports.chapters.getSentences(ctx.chapterId);
  const model = await ctx.ports.catalog.find(ctx.record.narration.model);
  const profile: NarrationProfile = model?.supportsStyle
    ? ctx.record.narration
    : { ...ctx.record.narration, style: null };

  const translated = sentences.some((s) => s.translated !== null);
  const { chapter, series } = ctx.record;
  const spokenLang = translated
    ? series.targetLang
    : (chapter.sourceLang ?? series.sourceLang ?? null);

  const limits = segmentLimitsFor(profile.model);
  const spoken = sentences.map((s) => spokenSentence(s, spokenLang));
  const groups = planTtsSegments(spoken, {
    maxChars: limits.maxChars,
    maxSeconds: limits.maxSeconds,
    firstMaxSeconds: limits.firstMaxSeconds,
  });
  const segments = groups.map((group, idx) => {
    const members = spoken.filter(
      (s) => s.idx >= group.sentenceStart && s.idx <= group.sentenceEnd,
    );
    const sentenceTexts = members.map((m) => m.text);
    const text = joinSpoken(sentenceTexts);
    return {
      idx,
      sentenceStart: group.sentenceStart,
      sentenceEnd: group.sentenceEnd,
      sentenceTexts,
      text,
      chars: countCodePoints(text),
      hash: stableHash([
        text,
        profile.provider,
        profile.model,
        profile.voice,
        profile.style,
        profile.speed,
      ]),
    };
  });
  return {
    profile,
    segments,
    spokenLang,
    concurrency: narrateConcurrencyFor(profile.model),
  };
}

/** A sentence as the planner sees it, with its estimated speech time in the spoken language. */
function spokenSentence(sentence: StoredSentence, spokenLang: string | null) {
  const text = (sentence.translated ?? sentence.text).trim();
  return {
    idx: sentence.idx,
    paragraphIdx: sentence.paragraphIdx,
    kind: sentence.kind,
    text,
    charCount: countCodePoints(text),
    seconds: estimateSpeechSeconds(text, spokenLang),
  };
}

/** Joins sentences with a space, except between CJK sentences, which are written without one. */
function joinSpoken(parts: readonly string[]): string {
  return parts.reduce((acc, part) => {
    if (acc === '') return part;
    const separator = detectScript(acc.slice(-1)) === 'cjk' ? '' : ' ';
    return `${acc}${separator}${part}`;
  }, '');
}

async function execute(ctx: StageContext, plan: Plan): Promise<void> {
  const { chapters } = ctx.ports;
  const { profile, segments } = plan;
  assertNarratorSpeaks(profile, plan.spokenLang);
>>>>>>> 54b3d2e
  const existing = await chapters.listAudioSegments(ctx.chapterId);
  let savedChars = 0;

<<<<<<< HEAD
  /**
   * Announces a segment that is saved or reused, in order. The first segment also makes the chapter
   * playable, and progress advances with the characters that are saved.
   */
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
    ctx.emit({
      type: 'progress',
      chapterId: ctx.chapterId,
      stage: 'narrate',
      progress: Math.min(1, savedChars / estimate),
    });
  };

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
      announce(segment, uri, durationMs, timing);
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
=======
  let firstStale = 0;
  while (firstStale < segments.length && matches(existing[firstStale], segments[firstStale])) {
    firstStale += 1;
  }
  if (existing.length > firstStale) {
    await chapters.deleteAudioFrom(ctx.chapterId, firstStale);
  }

  const total = segments.length;
  // Announce the passages already saved, so a resumed run starts at the right count.
  ctx.emit({
    type: 'progress',
    chapterId: ctx.chapterId,
    stage: 'narrate',
    progress: firstStale / total,
    passages: { done: firstStale, total },
  });
  await runOrdered(
    segments.slice(firstStale),
    (segment, _index, signal) => narrateSegment(ctx, plan, segment, total, signal),
    {
      concurrency: plan.concurrency,
      signal: ctx.signal,
      onResult: (made) => saveSegment(ctx, profile, made, total),
    },
  );
>>>>>>> 54b3d2e

  const saved = await chapters.listAudioSegments(ctx.chapterId);
  const durationMs = saved.reduce((sum, s) => sum + s.durationMs, 0);
  await chapters.setMeta(ctx.chapterId, { durationMs });
  return {
    inputHash: stableHash(['narrate', finals.map((s) => s.hash)]),
    status: synthesized === 0 ? 'skipped' : 'done',
  };
}

/**
<<<<<<< HEAD
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
=======
 * Synthesizes one segment and writes its audio file. A retryable failure that survives the
 * split-and-join fallback is reported with the passage number. The passages saved before it stay
 * saved, so a retry resumes at this one.
 */
async function narrateSegment(
  ctx: StageContext,
  plan: Plan,
  segment: PlannedSegment,
  total: number,
  signal: AbortSignal,
): Promise<MadeSegment> {
  try {
    const clip = await synthesizeWithFallback(segment.sentenceTexts, (sentences) =>
      speak(ctx, plan, sentences, signal),
    );
    const uri = await ctx.ports.audio.write(
      ctx.chapterId,
      segment.idx,
      clip.bytes,
      audioContainer(clip.mime) ?? 'bin',
    );
    return { segment, uri, durationMs: clip.durationMs };
  } catch (thrown) {
    throw passageFailure(thrown, segment.idx + 1, total);
  }
}

/** One call to the narrator for `sentences`. The call is recorded, and its length is measured. */
async function speak(
  ctx: StageContext,
  plan: Plan,
  sentences: readonly string[],
  signal: AbortSignal,
): Promise<SpokenClip> {
  const text = joinSpoken(sentences);
  const result = await ctx.ports.tts.synthesize({ text, profile: plan.profile, signal });
  const measured = measureDurationMs(audioContainer(result.mime), result.bytes);
  const durationMs =
    measured !== null && measured > 0
      ? measured
      : Math.max(1, Math.round(estimateSpeechSeconds(text, plan.spokenLang) * 1000));
  await ctx.meter.recordSpeech(plan.profile.model, {
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
function passageFailure(thrown: unknown, passage: number, total: number): unknown {
  const error = toPipelineError(thrown);
  if (!error.retryable) return thrown;
  return new StageFailure(
    error.code,
    `The narrator service didn't answer for passage ${passage} of ${total}. Your progress is saved. Tap Retry to continue.`,
    { retryable: true, ...(error.detail === undefined ? {} : { detail: error.detail }) },
  );
}

/** Saves a segment's row and announces it. Called in segment order, so playback can follow along. */
async function saveSegment(
  ctx: StageContext,
  profile: NarrationProfile,
  made: MadeSegment,
  total: number,
): Promise<void> {
  const { segment, uri, durationMs } = made;
  const row: AudioSegment = {
>>>>>>> 54b3d2e
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
<<<<<<< HEAD
}

/** The exact length from the file header when the format has one, else an estimate from the text. */
function durationOf(ext: string, bytes: Uint8Array, text: string): number {
  const measured = measureDurationMs(ext, bytes);
  if (measured !== null && measured > 0) return measured;
  return Math.max(1, Math.round(estimateSpeechSeconds(text) * 1000));
}

function matches(stored: AudioSegment, planned: PlannedSegment): boolean {
=======
  await ctx.ports.chapters.saveAudioSegment(row);
  ctx.emit({
    type: 'segmentReady',
    chapterId: ctx.chapterId,
    segment: {
      idx: row.idx,
      sentenceStart: row.sentenceStart,
      sentenceEnd: row.sentenceEnd,
      durationMs,
      uri,
    },
  });
  ctx.emit({
    type: 'progress',
    chapterId: ctx.chapterId,
    stage: 'narrate',
    progress: (segment.idx + 1) / total,
    passages: { done: segment.idx + 1, total },
  });
}

function matches(stored: AudioSegment | undefined, planned: PlannedSegment | undefined): boolean {
>>>>>>> 54b3d2e
  return (
    stored.idx === planned.idx &&
    stored.sentenceStart === planned.sentenceStart &&
    stored.sentenceEnd === planned.sentenceEnd &&
    stored.inputHash === planned.hash
  );
}

/** Exact length from the file header when the format has one (MP3 frames, WAV data), else null. */
function measureDurationMs(container: 'mp3' | 'wav' | null, bytes: Uint8Array): number | null {
  if (container === 'mp3') return mp3DurationMs(bytes);
  if (container === 'wav') return wavDurationMs(bytes);
  return null;
}
