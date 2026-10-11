/*
 * The narrate stage: the spoken text (translation when present, else the original) is grouped into
 * segments and synthesized two at a time. Each saved segment is playable at once, so playback can
 * start before the chapter is finished. A rerun resumes at the first segment that is missing or was
 * made from different input (a new voice, a new style, or edited text).
 */
import type { AudioSegment, NarrationProfile } from '@/core/domain';
import { throwIfCancelled } from '@/core/llm/transport';
import { wavDurationMs } from '@/core/narration/formats';
import { countCodePoints } from '@/core/text/build';
import { planTtsSegments } from '@/core/text/chunk';
import { detectScript } from '@/core/text/normalize';
import { estimateSpeechSeconds } from '@/core/text/speech-rate';
import { estimateSentenceOffsets } from '@/core/text/timing';

import { stableHash } from '../hash';
import { mp3DurationMs } from '../mp3-duration';

import type { StageContext, StageDefinition } from '../context';
import type { StoredSentence } from '../ports';

/** Segments synthesized at once. Saving stays in segment order. */
export const NARRATE_CONCURRENCY = 2;

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

  const spoken = sentences.map((s) => spokenSentence(s));
  const groups = planTtsSegments(spoken);
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
  return { profile, segments };
}

function spokenSentence(sentence: StoredSentence) {
  const text = (sentence.translated ?? sentence.text).trim();
  return {
    idx: sentence.idx,
    paragraphIdx: sentence.paragraphIdx,
    kind: sentence.kind,
    text,
    charCount: countCodePoints(text),
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
  const { chapters, audio, tts } = ctx.ports;
  const { profile, segments } = plan;
  const existing = await chapters.listAudioSegments(ctx.chapterId);

  let firstStale = 0;
  while (firstStale < segments.length && matches(existing[firstStale], segments[firstStale])) {
    firstStale += 1;
  }
  if (existing.length > firstStale) {
    await chapters.deleteAudioFrom(ctx.chapterId, firstStale);
  }

  const total = segments.length;
  for (let start = firstStale; start < total; start += NARRATE_CONCURRENCY) {
    throwIfCancelled(ctx.signal);
    const batch = segments.slice(start, start + NARRATE_CONCURRENCY);
    const built = await Promise.all(
      batch.map(async (segment) => {
        const result = await tts.synthesize({ text: segment.text, profile, signal: ctx.signal });
        const ext = extensionFor(result.mime);
        const uri = await audio.write(ctx.chapterId, segment.idx, result.bytes, ext);
        const measured = measureDurationMs(ext, result.bytes);
        const durationMs =
          measured !== null && measured > 0
            ? measured
            : Math.max(1, Math.round(estimateSpeechSeconds(segment.text) * 1000));
        await ctx.meter.recordSpeech(profile.model, {
          chars: segment.chars,
          audioSeconds: durationMs / 1000,
          costUsd: result.costUsd,
        });
        return { segment, uri, durationMs };
      }),
    );

    for (const { segment, uri, durationMs } of built) {
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
      await chapters.saveAudioSegment(row);
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
    }
    ctx.emit({
      type: 'progress',
      chapterId: ctx.chapterId,
      stage: 'narrate',
      progress: (start + batch.length) / total,
    });
  }

  const saved = await chapters.listAudioSegments(ctx.chapterId);
  const durationMs = saved.reduce((sum, s) => sum + s.durationMs, 0);
  await chapters.setMeta(ctx.chapterId, { durationMs });
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
