/*
 * Benchmark for ADR-0008: time to first audio and total time for a 40-minute chapter.
 *
 * The clock is virtual (Jest fake timers), so the numbers are exact and the test runs in milliseconds.
 * The provider is simulated: a speech request takes 12 s, and analysis finishes at 40 s, as the brief
 * sets. The "before" numbers come from the algorithm this replaced, computed from the same chapter:
 * analysis ran first, and narration sent lock-step pairs of 600-character segments with no ramp.
 */
import { planTtsSegments } from '@/core/text/chunk';

import { CHAPTER_ID, createFakePorts, mp3Bytes } from './__fixtures__/fake-ports';
import { runChapter } from './runner';

import type { PipelineEvent } from './context';
import type { TtsResult } from './ports';

const T0 = 1_700_000_000_000;
const SPEECH_MS = 12_000;
const ANALYSIS_DONE_MS = 40_000;
/** The narrator's segment size for the benchmark's model, which has no size of its own. */
const SEGMENT_MAX_CHARS = 600;
/** Virtual time the test advances by at a step. Small enough that the first-audio time is precise. */
const STEP_MS = 10;

function sentence(n: number): string {
  return `Sentence ${n} of the long harbour chapter keeps the tide moving toward the quay.`;
}

/** Real-time sleep on the fake clock, until the given virtual time. */
function sleepUntil(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, time - Date.now())));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('progressive narration benchmark: a 40-minute chapter', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays the first sentence in seconds, and finishes well before the lock-step plan would', async () => {
    const text = Array.from({ length: 280 }, (_, n) => sentence(n)).join(' ');
    const fake = createFakePorts({
      sourceText: text,
      targetLang: null,
      llm: async (request) => {
        if (request.jsonSchema?.name === 'chapter_analysis')
          await sleepUntil(T0 + ANALYSIS_DONE_MS);
        return undefined;
      },
      tts: async (): Promise<TtsResult> => {
        await sleep(SPEECH_MS);
        return { bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null };
      },
    });
    const ports = { ...fake.ports, clock: { now: () => Date.now() } };

    let playableAt: number | null = null;
    let doneAt: number | null = null;
    const onEvent = (event: PipelineEvent): void => {
      if (event.type === 'playable' && playableAt === null) playableAt = Date.now();
      if (event.type === 'done') doneAt = Date.now();
    };
    let outcome: unknown = null;
    const run = runChapter(CHAPTER_ID, ports, { onEvent }).then((result) => {
      outcome = result;
    });
    while (outcome === null) await jest.advanceTimersByTimeAsync(STEP_MS);
    await run;

    expect(outcome).toEqual({ status: 'ready' });
    const after = { firstAudioMs: (playableAt ?? NaN) - T0, totalMs: (doneAt ?? NaN) - T0 };

    // The chapter as the lock-step algorithm planned it: no ramp, 600-character segments.
    const sentences = fake.state.sentences.get(CHAPTER_ID) ?? [];
    const lockStepSegments = planTtsSegments(sentences, { maxChars: SEGMENT_MAX_CHARS }).length;
    const before = {
      firstAudioMs: ANALYSIS_DONE_MS + SPEECH_MS,
      totalMs: ANALYSIS_DONE_MS + Math.ceil(lockStepSegments / 2) * SPEECH_MS,
    };

    const chars = sentences.reduce((sum, s) => sum + s.charCount, 0);
    const segments = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    const report = [
      '',
      '=== progressive narration benchmark (40-minute chapter, 12 s per speech request, analysis 40 s) ===',
      `chapter: ${sentences.length} sentences, ${chars} characters`,
      `segments: ${segments} (ramped) vs ${lockStepSegments} (lock-step, 600 characters)`,
      `time to first audio: before ${before.firstAudioMs / 1000} s, after ${after.firstAudioMs / 1000} s`,
      `total time:          before ${before.totalMs / 1000} s, after ${after.totalMs / 1000} s`,
      '',
    ].join('\n');
    process.stdout.write(report);

    expect(chars).toBeGreaterThan(20_000);
    expect(after.firstAudioMs).toBeLessThanOrEqual(20_000);
    expect(after.firstAudioMs).toBeLessThan(before.firstAudioMs / 4);
    expect(after.totalMs).toBeLessThan(before.totalMs / 2);
    expect(segments).toBeGreaterThan(0);
  });
});
