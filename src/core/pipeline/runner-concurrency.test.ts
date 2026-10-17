/*
 * The concurrent part of the runner (ADR-0008): analysis beside translation and narration. Each test
 * holds one stage by hand, so the order the stages finish in is the one the test asks for.
 */
import type { LlmRequest } from '@/core/llm/transport';

import { CHAPTER_ID, createFakePorts, mp3Bytes } from './__fixtures__/fake-ports';
import { longText } from './__fixtures__/pages';
import { untilSettled } from './abort';
import { runChapter } from './runner';

import type { PipelineEvent } from './context';
import type { TtsResult } from './ports';

const ANALYSIS = 'chapter_analysis';
const LONG = longText(12, 250);

/** A one-shot latch the test opens by hand. */
function latch(): { readonly open: () => void; readonly opened: Promise<void> } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

/**
 * Holds a model call until the latch opens. Like the real transport, the call rejects with a
 * cancellation when the run is aborted, so a held stage never outlives its run.
 */
async function holdUntil(request: LlmRequest, gate: Promise<void>): Promise<undefined> {
  await untilSettled(gate, request.signal ?? new AbortController().signal);
  return undefined;
}

/**
 * Speech for the first request, which completes, and for the rest, which wait until `release` opens or
 * the run is cancelled. So narration stops after one segment, as a slow provider would leave it.
 */
function heldAfterFirst(
  release: Promise<void>,
): (text: string, profile: unknown, signal: AbortSignal) => Promise<TtsResult> {
  let calls = 0;
  const result: TtsResult = { bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null };
  return async (_text, _profile, signal) => {
    calls += 1;
    if (calls > 1) await untilSettled(release, signal);
    return result;
  };
}

function recorder(): { events: PipelineEvent[]; onEvent: (event: PipelineEvent) => void } {
  const events: PipelineEvent[] = [];
  return { events, onEvent: (event) => events.push(event) };
}

/** Waits for a condition that the run reaches on its own. Fails the test if it never holds. */
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 2_000; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('the run never reached the expected state');
}

function networkFailure(): Error {
  return Object.assign(new Error('No connection'), {
    error: { code: 'NETWORK', message: 'No connection to OpenRouter.', retryable: false },
  });
}

describe('runChapter: analysis runs beside narration', () => {
  it('starts narrating before the analysis has finished, when nothing is translated', async () => {
    const analysis = latch();
    const fake = createFakePorts({
      sourceText: LONG,
      targetLang: null,
      llm: (request) =>
        request.jsonSchema?.name === ANALYSIS ? holdUntil(request, analysis.opened) : undefined,
    });
    const { events, onEvent } = recorder();

    const run = runChapter(CHAPTER_ID, fake.ports, { onEvent });
    await until(() => events.some((e) => e.type === 'playable'));

    expect(fake.job('analyze')?.status).toBe('running');
    expect(fake.state.segments.get(CHAPTER_ID)?.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'analysisReady')).toBe(false);

    analysis.open();
    expect(await run).toEqual({ status: 'ready' });
    expect(events.filter((e) => e.type === 'analysisReady')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'playable')).toHaveLength(1);
  });

  it('translates the opening window before the analysis, and holds the rest until it is done', async () => {
    const analysis = latch();
    const fake = createFakePorts({
      sourceText: LONG,
      targetLang: 'it',
      llm: (request) =>
        request.jsonSchema?.name === ANALYSIS ? holdUntil(request, analysis.opened) : undefined,
    });

    const run = runChapter(CHAPTER_ID, fake.ports);
    const translatedCount = (): number =>
      (fake.state.sentences.get(CHAPTER_ID) ?? []).filter((s) => s.translated !== null).length;
    await until(() => translatedCount() > 0);

    const total = fake.state.sentences.get(CHAPTER_ID)?.length ?? 0;
    expect(translatedCount()).toBeGreaterThan(0);
    expect(translatedCount()).toBeLessThan(total);
    expect(fake.job('translate')?.status).toBe('running');

    analysis.open();
    expect(await run).toEqual({ status: 'ready' });
    expect(translatedCount()).toBe(total);
  });

  it('only narrates text that is already translated while the rest is still waiting', async () => {
    const analysis = latch();
    const fake = createFakePorts({
      sourceText: LONG,
      targetLang: 'it',
      llm: (request) =>
        request.jsonSchema?.name === ANALYSIS ? holdUntil(request, analysis.opened) : undefined,
    });

    const run = runChapter(CHAPTER_ID, fake.ports);
    await until(() => fake.state.segments.get(CHAPTER_ID)?.length !== undefined);
    await until(() => fake.state.ttsCalls.length > 0);

    // The default fake translation prefixes each sentence with "EN ", so untranslated text is visible.
    for (const call of fake.state.ttsCalls) expect(call.text.startsWith('EN ')).toBe(true);

    analysis.open();
    expect(await run).toEqual({ status: 'ready' });
    expect(fake.state.ttsCalls.every((call) => call.text.startsWith('EN '))).toBe(true);
  });

  it('cancels analysis, translation and narration together, and reports the cancel once', async () => {
    const analysis = latch();
    const controller = new AbortController();
    const fake = createFakePorts({
      sourceText: LONG,
      targetLang: 'it',
      llm: (request) =>
        request.jsonSchema?.name === ANALYSIS ? holdUntil(request, analysis.opened) : undefined,
    });
    const { events, onEvent } = recorder();

    const run = runChapter(CHAPTER_ID, fake.ports, { signal: controller.signal, onEvent });
    await until(() => events.some((e) => e.type === 'playable'));
    controller.abort();

    expect(await run).toEqual({ status: 'cancelled', stage: expect.any(String) });
    expect(fake.job('analyze')?.status).toBe('cancelled');
    expect(fake.job('translate')?.status).toBe('cancelled');
    expect(fake.job('narrate')?.status).toBe('cancelled');
    expect(fake.chapter().status).toBe('draft');
    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ error: { code: 'CANCELLED' } });
  });

  it('keeps the first failure as the error, cancels the stages beside it, and writes no second error', async () => {
    const speech = latch();
    const fake = createFakePorts({
      sourceText: LONG,
      targetLang: null,
      tts: heldAfterFirst(speech.opened),
      llm: async (request) => {
        if (request.jsonSchema?.name !== ANALYSIS) return undefined;
        // Narration holds its second request, so the analysis fails while narration is mid-run.
        await until(() => fake.state.ttsCalls.length >= 2);
        throw networkFailure();
      },
    });
    const { events, onEvent } = recorder();

    const outcome = await runChapter(CHAPTER_ID, fake.ports, { onEvent });

    expect(outcome).toMatchObject({ status: 'failed', stage: 'analyze' });
    expect(fake.chapter().status).toBe('failed');
    expect(fake.job('analyze')?.status).toBe('failed');
    expect(fake.job('narrate')?.status).toBe('cancelled');
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'stage', stage: 'narrate', status: 'cancelled' }),
    );
  });

  it('resumes after an analysis failure without buying the audio that was saved', async () => {
    let failAnalysis = true;
    const speech = latch();
    const fake = createFakePorts({
      sourceText: LONG,
      targetLang: null,
      tts: heldAfterFirst(speech.opened),
      llm: async (request) => {
        if (request.jsonSchema?.name !== ANALYSIS || !failAnalysis) return undefined;
        await until(() => fake.state.ttsCalls.length >= 2);
        throw networkFailure();
      },
    });
    await runChapter(CHAPTER_ID, fake.ports);
    const saved = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(saved).toBe(1);

    failAnalysis = false;
    speech.open();
    const ttsBefore = fake.state.ttsCalls.length;
    const resumed = await runChapter(CHAPTER_ID, fake.ports);

    const total = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(resumed).toEqual({ status: 'ready' });
    expect(total).toBeGreaterThan(saved);
    // The saved segment is reused, so it is not synthesized again.
    expect(fake.state.ttsCalls.length - ttsBefore).toBe(total - saved);
    expect(fake.job('analyze')?.status).toBe('done');
  });
});
