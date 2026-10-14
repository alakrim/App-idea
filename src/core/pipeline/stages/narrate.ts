/*
 * The narrate stage: the spoken text (translation when present, else the original) is grouped into
 * segments and synthesized a few at a time. Segments are saved and emitted in order, so each one is
 * playable as soon as it is saved, and playback can start before the chapter is finished. A rerun
 * resumes at the first segment that is missing or was made from different input (a new voice, a new
 * style, or edited text).
 */
import { runOrdered } from '@/core/async/ordered-pool';
import type { AudioSegment, NarrationProfile } from '@/core/domain';
import { wavDurationMs } from '@/core/narration/formats';
import {
  isLanguageSupported,
  narrateConcurrencyFor,
  optionFor,
  segmentLimitsFor,
} from '@/core/narration/options';
import { countCodePoints } from '@/core/text/build';
import { planTtsSegments } from '@/core/text/chunk';
import { detectScript } from '@/core/text/normalize';
import { estimateSpeechSeconds } from '@/core/text/speech-rate';
import { estimateSentenceOffsets } from '@/core/text/timing';

import { StageFailure, toPipelineError } from '../errors';
import { stableHash } from '../hash';
import { mp3DurationMs } from '../mp3-duration';
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

export const narrateStage: StageDefinition = {
  stage: 'narrate',
  async prepare(ctx) {
    const plan = await buildPlan(ctx);
    const inputHash = stableHash(['narrate', plan.segments.map((s) => s.hash)]);
    return {
      inputHash,
      model: plan.profile.model,
      promptVersion: null,
      skip: plan.segments.length === 0,
      execute: () => execute(ctx, plan),
    };
  },
};

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
  const existing = await chapters.listAudioSegments(ctx.chapterId);

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

  const saved = await chapters.listAudioSegments(ctx.chapterId);
  const durationMs = saved.reduce((sum, s) => sum + s.durationMs, 0);
  await chapters.setMeta(ctx.chapterId, { durationMs });
}

/**
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
    generationId: result.generationId,
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
  return (
    stored !== undefined &&
    planned !== undefined &&
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
