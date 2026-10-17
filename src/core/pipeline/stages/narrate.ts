/*
 * The narrate stage (ADR-0008). The spoken text is planned into segments as its sentences become
 * final, and each segment is synthesized as soon as it is complete. Requests run in an adaptive
 * window, and the segments are saved and announced strictly in order, so the player always has a
 * contiguous prefix.
 *
 * Audio is content-addressed: a passage's clip is named by its input hash (its text and voice), so
 * a rerun reuses any stored clip with the same hash, at whatever index it was made. A passage that
 * finishes ahead of an earlier one is saved at once and announced when its turn comes (QA-F F-05).
 * Only clips no longer in the plan are deleted, after the new plan is stored (QA-F F-06). The stage's job hash is the hash of the final plan, written when the stage
 * completes. A passage that still fails after the transport's own retries is split in two and joined
 * (narrate-fallback), and a failure that survives that is reported with its passage number.
 */
import type { AudioSegment, Id, NarrationProfile } from '@/core/domain';
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
import type { AudioFiles } from '../ports';
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

/** A clip already stored for some passage, found by its input hash. */
interface StoredClip {
  readonly uri: string;
  readonly durationMs: number;
}

/** What the pool produced for one passage: a stored clip reused as it is, or one freshly bought. */
type Made =
  | { readonly reused: true; readonly clip: StoredClip }
  | { readonly reused: false; readonly clip: SpokenClip };

/** A passage whose audio is on disk, waiting to be announced in order. */
interface Ready {
  readonly segment: PlannedSegment;
  readonly uri: string;
  readonly durationMs: number;
  /** Null for a clip reused from disk, which made no speech call. */
  readonly timing: SegmentTiming | null;
}

/** A clip file is named `<input hash>-<duration ms>.<ext>`, so the name says what the clip holds. */
const CLIP_FILE = /^(.+)-(\d+)\.[a-z0-9]+$/u;

function clipFileName(segment: PlannedSegment, durationMs: number, ext: string): string {
  return `${segment.hash}-${durationMs}.${ext}`;
}

function fileNameOf(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

/**
 * Every stored clip of the chapter by input hash: the rows already in the plan, then the clip files,
 * whatever index they were made at. A replan that moves a passage therefore reuses its audio.
 */
async function storedClips(
  audio: AudioFiles,
  chapterId: Id,
  rows: readonly AudioSegment[],
): Promise<Map<string, StoredClip>> {
  const clips = new Map<string, StoredClip>();
  for (const row of rows) {
    if (!clips.has(row.inputHash)) {
      clips.set(row.inputHash, { uri: row.fileUri, durationMs: row.durationMs });
    }
  }
  for (const file of await audio.list(chapterId)) {
    const match = CLIP_FILE.exec(file.name);
    if (match === null) continue;
    const [, hash, durationMs] = match;
    if (hash === undefined || durationMs === undefined || clips.has(hash)) continue;
    clips.set(hash, { uri: file.uri, durationMs: Number(durationMs) });
  }
  return clips;
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
  const rows = await chapters.listAudioSegments(ctx.chapterId);
  const stored = await storedClips(audio, ctx.chapterId, rows);
  const rowsByIdx = new Map(rows.map((row) => [row.idx, row] as const));
  const ready = new Map<number, Ready>();
  let nextIdx = 0;
  let rowsTrimmed = false;
  let savedChars = 0;
  let synthesized = 0;

  /** The passage count, once the chapter's text is complete. Null while it can still grow. */
  const passageTotal = (): number | null =>
    ctx.spoken.complete ? planFinalSegments(ctx.spoken.prefix(), plan, true).length : null;

  /**
   * Announces a passage that is saved, in order. The first passage also makes the chapter playable,
   * and progress advances with the characters that are saved.
   */
  const announce = (entry: Ready): void => {
    const { segment } = entry;
    savedChars += segment.chars;
    ctx.emit({
      type: 'segmentReady',
      chapterId: ctx.chapterId,
      segment: {
        idx: segment.idx,
        sentenceStart: segment.sentenceStart,
        sentenceEnd: segment.sentenceEnd,
        durationMs: entry.durationMs,
        uri: entry.uri,
        chars: segment.chars,
        synthesis:
          entry.timing === null ? null : { ms: entry.timing.synthMs, slots: entry.timing.slots },
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

  /**
   * Stores the row of a passage. A row that already matches is kept. The first row that does not
   * match, and every row after it, is replaced. Only rows go: the clip files stay until the end.
   */
  const storeRow = async (entry: Ready): Promise<void> => {
    const row = rowsByIdx.get(entry.segment.idx);
    if (!rowsTrimmed && row !== undefined && matches(row, entry.segment)) return;
    if (!rowsTrimmed) {
      rowsTrimmed = true;
      await chapters.deleteAudioFrom(ctx.chapterId, entry.segment.idx);
    }
    await chapters.saveAudioSegment(
      toRow(ctx, entry.segment, entry.uri, entry.durationMs, profile),
    );
  };

  /** Announces every passage that is next in order. A passage behind an unfinished one waits. */
  const announceInOrder = async (): Promise<void> => {
    for (let entry = ready.get(nextIdx); entry !== undefined; entry = ready.get(nextIdx)) {
      ready.delete(nextIdx);
      nextIdx += 1;
      await storeRow(entry);
      announce(entry);
    }
  };

  /** Saves a finished passage's clip at once, unless it is reused, then announces what is in order. */
  const save = async (
    segment: PlannedSegment,
    made: Made,
    timing: SegmentTiming,
  ): Promise<void> => {
    let entry: Ready;
    if (made.reused) {
      entry = { segment, uri: made.clip.uri, durationMs: made.clip.durationMs, timing: null };
    } else {
      const { clip } = made;
      const ext = extensionFor(clip.mime);
      const fileName = clipFileName(segment, clip.durationMs, ext);
      const uri = await audio.write(ctx.chapterId, fileName, clip.bytes);
      stored.set(segment.hash, { uri, durationMs: clip.durationMs });
      synthesized += 1;
      entry = { segment, uri, durationMs: clip.durationMs, timing };
    }
    ready.set(segment.idx, entry);
    await announceInOrder();
  };

  const pool = new SlidingWindow<PlannedSegment, Made>({
    window: new AdaptiveWindow({ ceiling: narrateConcurrencyFor(profile.model) }),
    signal: ctx.signal,
    now: () => ctx.ports.clock.now(),
    work: (segment, signal) => makePassage(ctx, profile, segment, signal, stored, passageTotal),
    save,
  });

  const finals: PlannedSegment[] = [];
  let lastEstimate = -1;
  for (let k = 0; ; k += 1) {
    const segment = await nextFinalSegment(ctx.spoken, ctx.signal, k, plan, (chars) => {
      if (chars === lastEstimate) return;
      lastEstimate = chars;
      ctx.emit({ type: 'spokenChars', chapterId: ctx.chapterId, chars });
    });
    if (segment === null) break;
    finals.push(segment);
    await pool.submit(segment);
  }
  await pool.finish();
  if (rows.length > finals.length) await chapters.deleteAudioFrom(ctx.chapterId, finals.length);

  // Only once the new plan is stored are the clip files it no longer uses deleted (QA-F F-06).
  const saved = await chapters.listAudioSegments(ctx.chapterId);
  await audio.prune(ctx.chapterId, new Set(saved.map((row) => fileNameOf(row.fileUri))));
  const durationMs = saved.reduce((sum, s) => sum + s.durationMs, 0);
  await chapters.setMeta(ctx.chapterId, { durationMs });
  return {
    inputHash: stableHash(['narrate', finals.map((s) => s.hash)]),
    status: synthesized === 0 ? 'skipped' : 'done',
  };
}

/** A passage's clip: the stored one when its hash is known, else one bought from the narrator. */
async function makePassage(
  ctx: FlowContext,
  profile: NarrationProfile,
  segment: PlannedSegment,
  signal: AbortSignal,
  stored: ReadonlyMap<string, StoredClip>,
  passageTotal: () => number | null,
): Promise<Made> {
  const clip = stored.get(segment.hash);
  if (clip !== undefined) return { reused: true, clip };
  return { reused: false, clip: await narrateSegment(ctx, profile, segment, signal, passageTotal) };
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
